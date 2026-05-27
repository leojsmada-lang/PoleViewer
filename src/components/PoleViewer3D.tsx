// PoleViewer3D.tsx — interactive 3D viewer for a single pole + LiDAR terrain.
//
// TECHNOLOGIES USED:
//   Three.js — a JavaScript library that wraps WebGL (the browser's 3D graphics API).
//     WebGL is very low-level (similar to writing GPU shaders); Three.js gives you
//     high-level objects like Scene, Camera, Mesh, and Material instead.
//
//   React useEffect — runs side effects after the component renders. Here it creates
//     and owns the entire Three.js scene. The cleanup function it returns tears
//     everything down when the component unmounts (tab switch, pole change, etc.),
//     preventing memory leaks and stale canvas elements.
//
// SCENE COORDINATE SYSTEM:
//   Three.js uses a right-handed Y-up system:
//     +X = right, +Y = up, +Z = toward the viewer
//   LiDAR data from USGS uses projected CRS (EPSG:3857) where Z is elevation.
//   The loader remaps Z→Y and Y→-Z to match Three.js conventions.

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Pole } from '../types/Pole';
import { findDatasetsForLocation, fetchEptManifest } from '../services/lidarService';
import { loadEptPointCloud } from '../services/eptLoader';

interface PoleViewer3DProps {
    pole: Pole; // the pole to render — changing this prop re-runs the entire useEffect
}

// Convert WGS84 lat/lng to EPSG:3857 (Web Mercator) metres — the same CRS the
// USGS LiDAR EPT tiles use. This lets us centre the point cloud on the pole's
// real-world position rather than the dataset centroid, which can be 100+ km away.
function latLngToWebMercator(lat: number, lng: number): [number, number] {
    const R = 6378137.0; // WGS84 semi-major axis in metres
    const x = lng * (Math.PI / 180) * R;
    const y = Math.log(Math.tan(Math.PI / 4 + lat * (Math.PI / 360))) * R;
    return [x, y];
}

// Color map for the wire/insulator on each attachment type (as hex integers, not strings)
const attachmentColors: Record<string, number> = {
    Power:   0xFF2222, // red
    Telecom: 0x2244FF, // blue
    Fiber:   0x00DD44, // green
};

const PoleViewer3D: React.FC<PoleViewer3DProps> = ({ pole }) => {
    // useRef gives a stable reference to the DOM div that Three.js renders into.
    // Unlike useState, updating a ref doesn't cause a re-render.
    const mountRef = useRef<HTMLDivElement>(null);

    // These state values drive the overlay UI only — they don't affect the 3D scene.
    // useState triggers a React re-render when changed, which updates the overlay text/progress.
    const [lidarStatus, setLidarStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const [lidarProgress, setLidarProgress] = useState(0);
    const [lidarStage, setLidarStage] = useState('');
    const [lidarDataset, setLidarDataset] = useState('');
    const [lidarPoints, setLidarPoints] = useState(0);
    const [lidarError, setLidarError] = useState('');

    // useEffect runs after the component mounts (and re-runs whenever `pole` changes).
    // The dependency array [pole] at the bottom means: re-run this effect whenever
    // the pole prop changes. Without it, the scene would never update when you
    // select a different pole.
    useEffect(() => {
        if (!mountRef.current) return;
        const container = mountRef.current;

        // Reset LiDAR overlay state for the new pole
        setLidarStatus('idle');
        setLidarProgress(0);
        setLidarError('');

        // ── SCENE SETUP ──────────────────────────────────────────────────────
        // A Scene is the container for all 3D objects, lights, and cameras.
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87CEEB); // sky blue

        const width = container.clientWidth || 800;
        const height = 500;

        // PerspectiveCamera mimics how human eyes see (objects shrink with distance).
        //   60  = vertical field of view in degrees (wider = more visible, more distortion)
        //   w/h = aspect ratio (must match the renderer size or the image will stretch)
        //   0.1 = near clipping plane — objects closer than this are not drawn
        //   1000 = far clipping plane — objects farther than this are not drawn
        const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 5000);
        camera.position.set(15, pole.height * 0.7, 20);
        camera.lookAt(0, pole.height * 0.5, 0); // aim the camera at the mid-point of the pole

        // WebGLRenderer draws the scene to a <canvas> element.
        // antialias: true smooths jagged edges (costs a small amount of GPU performance).
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.shadowMap.enabled = true; // enable shadow casting/receiving
        container.appendChild(renderer.domElement); // add the <canvas> to the page

        // ── MANUAL ORBIT CONTROLS ────────────────────────────────────────────
        // Implements click-drag to rotate and scroll-wheel to zoom.
        // "Spherical coordinates" (radius, phi, theta) are more natural for
        // an orbit camera than Cartesian (x,y,z) because you can change the
        // viewing angle without losing the target or the correct distance.
        //
        //   theta = horizontal angle (left/right rotation around Y axis)
        //   phi   = vertical angle (up/down tilt, clamped so you can't flip past vertical)
        //   radius = distance from the target point
        let isMouseDown = false;
        let mouseX = 0;
        let mouseY = 0;
        let sphericalTheta = Math.PI / 4;    // start at 45° horizontal
        let sphericalPhi   = Math.PI / 3;    // start at 60° vertical (slightly above horizon)
        let radius = 25;
        const target = new THREE.Vector3(0, pole.height * 0.5, 0); // orbit around pole midpoint

        // Converts spherical coordinates back to Cartesian (x,y,z) for the camera position.
        const updateCamera = () => {
            camera.position.x = target.x + radius * Math.sin(sphericalPhi) * Math.sin(sphericalTheta);
            camera.position.y = target.y + radius * Math.cos(sphericalPhi);
            camera.position.z = target.z + radius * Math.sin(sphericalPhi) * Math.cos(sphericalTheta);
            camera.lookAt(target);
        };
        updateCamera();

        const onMouseDown = (e: MouseEvent) => {
            isMouseDown = true;
            mouseX = e.clientX;
            mouseY = e.clientY;
        };
        const onMouseMove = (e: MouseEvent) => {
            if (!isMouseDown) return;
            const deltaX = e.clientX - mouseX; // pixels moved horizontally
            const deltaY = e.clientY - mouseY; // pixels moved vertically
            mouseX = e.clientX;
            mouseY = e.clientY;
            sphericalTheta -= deltaX * 0.01; // 0.01 = sensitivity (radians per pixel)
            // Clamp phi to (0.1, π/2) so you can't orbit past straight-up or below the ground
            sphericalPhi = Math.max(0.1, Math.min(Math.PI / 2, sphericalPhi + deltaY * 0.01));
            updateCamera();
        };
        const onMouseUp = () => { isMouseDown = false; };
        const onWheel = (e: WheelEvent) => {
            // deltaY is positive when scrolling down (zoom out), negative when scrolling up (zoom in)
            radius = Math.max(5, Math.min(500, radius + e.deltaY * 0.05));
            updateCamera();
        };

        renderer.domElement.addEventListener('mousedown', onMouseDown);
        renderer.domElement.addEventListener('mousemove', onMouseMove);
        renderer.domElement.addEventListener('mouseup', onMouseUp);
        renderer.domElement.addEventListener('wheel', onWheel);

        // ── LIGHTING ─────────────────────────────────────────────────────────
        // DirectionalLight simulates the sun — parallel rays from one direction.
        // castShadow: true lets this light produce shadows from Mesh objects.
        const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
        sunLight.position.set(10, 20, 10);
        sunLight.castShadow = true;
        scene.add(sunLight);

        // AmbientLight illuminates all surfaces equally regardless of angle —
        // prevents the shadow side of objects from being completely black.
        scene.add(new THREE.AmbientLight(0x606060, 1.0));

        // ── PLACEHOLDER GROUND + GRID ─────────────────────────────────────────
        // Shown immediately while LiDAR data loads. The `name` properties let us
        // find and remove these objects once the real point cloud arrives.
        const groundGeo = new THREE.PlaneGeometry(100, 100); // flat square, 100 units per side
        const groundMat = new THREE.MeshLambertMaterial({ color: 0x5a8a3c }); // grass green
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2; // PlaneGeometry is vertical by default; rotate to horizontal
        ground.receiveShadow = true;
        ground.name = 'fallbackGround'; // tag so we can remove it later
        scene.add(ground);

        const grid = new THREE.GridHelper(100, 40, 0x000000, 0x000000);
        grid.position.y = 0.01; // raise slightly above ground to avoid z-fighting (flickering)
        (grid.material as THREE.Material).opacity = 0.15;
        (grid.material as THREE.Material).transparent = true;
        grid.name = 'fallbackGrid';
        scene.add(grid);

        // ── POLE MESH ─────────────────────────────────────────────────────────
        // CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)
        // A utility pole is slightly tapered (wider at base), hence 0.15 vs 0.25.
        let poleColor: number;
        if (pole.condition === 'Good')      poleColor = 0x00AA00; // green
        else if (pole.condition === 'Fair') poleColor = 0xFF8800; // orange
        else                                poleColor = 0xCC0000; // red

        const poleGeo = new THREE.CylinderGeometry(0.15, 0.25, pole.height, 12);
        const poleMat = new THREE.MeshLambertMaterial({ color: poleColor });
        const poleMesh = new THREE.Mesh(poleGeo, poleMat);
        poleMesh.position.y = pole.height / 2; // CylinderGeometry is centered at Y=0; shift up so base is at ground
        poleMesh.castShadow = true;
        scene.add(poleMesh);

        // ── ATTACHMENTS (cross-arms + wires) ─────────────────────────────────
        pole.attachments.forEach((att) => {
            // Cross-arm: a horizontal cylinder rotated 90° around Z to lie flat
            const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 6, 8);
            const armMat = new THREE.MeshLambertMaterial({ color: 0x4A3728 }); // dark wood brown
            const arm = new THREE.Mesh(armGeo, armMat);
            arm.rotation.z = Math.PI / 2; // rotate from vertical to horizontal
            arm.position.y = att.height;
            scene.add(arm);

            const wColor = attachmentColors[att.type] || 0xFFFFFF;

            // Two insulators (spheres) at each end of the cross-arm
            const insGeo = new THREE.SphereGeometry(0.18, 8, 8);
            const insMat = new THREE.MeshLambertMaterial({ color: wColor });
            [-3, 3].forEach(xPos => {
                const ins = new THREE.Mesh(insGeo, insMat);
                ins.position.set(xPos, att.height, 0);
                scene.add(ins);
            });

            // Wire with catenary sag: a line drawn through 21 points.
            // Math.sin(t * π) produces a bell curve that peaks at t=0.5 (mid-span) —
            // multiplied by 0.5 to make the sag subtle.
            const wirePoints: THREE.Vector3[] = [];
            for (let i = 0; i <= 20; i++) {
                const t = i / 20;             // 0 to 1 across the span
                const x = -3 + t * 6;         // from left insulator to right insulator
                const sag = Math.sin(t * Math.PI) * 0.5; // downward droop at centre
                wirePoints.push(new THREE.Vector3(x, att.height - sag, 0));
            }
            const wireGeo = new THREE.BufferGeometry().setFromPoints(wirePoints);
            const wireLineMat = new THREE.LineBasicMaterial({ color: wColor });
            scene.add(new THREE.Line(wireGeo, wireLineMat));
        });

        // ── CONDITION BALL ────────────────────────────────────────────────────
        // A glowing sphere on top of the pole as a quick visual condition indicator.
        // MeshBasicMaterial is unlit — it always shows at full brightness,
        // making it visible even when the sun is on the other side.
        const ballColor = pole.condition === 'Good' ? 0x00FF00
            : pole.condition === 'Fair' ? 0xFF8800 : 0xFF0000;
        const ballGeo = new THREE.SphereGeometry(0.4, 16, 16);
        const ballMat = new THREE.MeshBasicMaterial({ color: ballColor });
        const ball = new THREE.Mesh(ballGeo, ballMat);
        ball.position.y = pole.height + 0.7;
        scene.add(ball);

        // ── ANIMATION LOOP ────────────────────────────────────────────────────
        // requestAnimationFrame asks the browser to call `animate` before the next
        // paint (typically 60 times per second). The scene must be re-rendered each
        // frame because the camera may have moved (from mouse/wheel events).
        let animationId: number;
        const animate = () => {
            animationId = requestAnimationFrame(animate);
            renderer.render(scene, camera); // draw the scene from the camera's point of view
        };
        animate();

        // ── LIDAR STREAMING ───────────────────────────────────────────────────
        // Runs asynchronously after the scene is already rendering.
        // When complete, it swaps out the placeholder ground for a real point cloud.
        //
        // `isMounted` guards against a race condition: if the user switches tabs
        // while the async fetch is still in flight, the component unmounts. Without
        // the guard, the fetch would finish, try to call setLidarStatus(), and React
        // would warn about updating state on an unmounted component.
        let isMounted = true;

        const streamLidar = async () => {
            setLidarStatus('loading');
            setLidarStage('Searching USGS 3DEP catalog...');
            setLidarProgress(5);

            try {
                // 1. Get the list of datasets covering this pole's GPS location
                const datasets = await findDatasetsForLocation(pole.latitude, pole.longitude);
                if (!isMounted) return;

                if (datasets.length === 0) {
                    setLidarStatus('error');
                    setLidarError('No LiDAR coverage for this location.');
                    return;
                }

                // Use the first (most relevant) dataset
                const dataset = datasets[0];
                setLidarDataset(dataset.name);
                setLidarStage(`Found: ${dataset.name}`);
                setLidarProgress(15);

                // 2. Fetch the small ept.json manifest that describes the dataset
                setLidarStage('Fetching EPT manifest...');
                const manifest = await fetchEptManifest(dataset.eptUrl);
                if (!isMounted) return;
                setLidarProgress(25);

                // 3. Stream point cloud tiles (depth 3 = ~hundreds of tiles, ~300K pts)
                setLidarStage('Streaming point cloud tiles...');
                const chunk = await loadEptPointCloud(dataset.eptUrl, manifest, {
                    maxPoints: 400_000,
                    maxDepth: 3,
                    onProgress: (loaded, total) => {
                        // Map tile loading progress to the 25–90% range of the progress bar
                        if (isMounted) setLidarProgress(25 + Math.floor((loaded / total) * 65));
                    },
                });
                if (!isMounted) return;

                if (chunk.count === 0) throw new Error('No points decoded');

                setLidarStage('Building geometry...');
                setLidarProgress(93);

                // 4. Center and remap axes.
                //    USGS LiDAR uses projected CRS (EPSG:3857, metres), Z = elevation.
                //    Three.js uses Y = elevation. We:
                //      a) subtract the pole's EPSG:3857 position (NOT the cloud centroid)
                //         so that world-origin (0,0,0) is directly below the pole.
                //         Using the cloud centroid instead would put the terrain 100+ km
                //         away from the camera, making it invisible.
                //      b) swap Z→Y and Y→-Z to match Three.js conventions
                const [poleEasting, poleNorthing] = latLngToWebMercator(pole.latitude, pole.longitude);

                // Debug: log coordinate ranges to diagnose CRS mismatch
                let minX = Infinity, maxX = -Infinity, minY2 = Infinity, maxY2 = -Infinity, minZ = Infinity, maxZ = -Infinity;
                for (let i = 0; i < Math.min(chunk.count, 400_000); i++) {
                    const cx = chunk.positions[i * 3 + 0];
                    const cy = chunk.positions[i * 3 + 1];
                    const cz = chunk.positions[i * 3 + 2];
                    if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
                    if (cy < minY2) minY2 = cy; if (cy > maxY2) maxY2 = cy;
                    if (cz < minZ) minZ = cz; if (cz > maxZ) maxZ = cz;
                }
                console.log(`[LiDAR] Chunk coord ranges — X:[${minX.toFixed(1)}, ${maxX.toFixed(1)}] Y:[${minY2.toFixed(1)}, ${maxY2.toFixed(1)}] Z:[${minZ.toFixed(1)}, ${maxZ.toFixed(1)}]`);
                console.log(`[LiDAR] Pole Web Mercator — easting:${poleEasting.toFixed(1)} northing:${poleNorthing.toFixed(1)}`);
                console.log(`[LiDAR] First 3 pts — (${chunk.positions[0].toFixed(1)},${chunk.positions[1].toFixed(1)},${chunk.positions[2].toFixed(1)}) (${chunk.positions[3].toFixed(1)},${chunk.positions[4].toFixed(1)},${chunk.positions[5].toFixed(1)}) (${chunk.positions[6].toFixed(1)},${chunk.positions[7].toFixed(1)},${chunk.positions[8].toFixed(1)})`);

                // Pass 1: centre XZ on the pole, keep raw elevations (metres AMSL).
                // Track both a local minY (within 2 km of the pole) and a global fallback.
                // Using a local baseline avoids far-away low-elevation points (e.g. coastal
                // areas in the same EPT dataset) dragging the ground plane hundreds of
                // metres below the actual terrain at the pole's location.
                const LOCAL_RADIUS = 2000; // Web Mercator metres (~2 km)
                const translated = new Float32Array(chunk.count * 3);
                let localMinY  = Infinity;
                let globalMinY = Infinity;
                for (let i = 0; i < chunk.count; i++) {
                    const tx = chunk.positions[i * 3 + 0] - poleEasting;
                    const ty = chunk.positions[i * 3 + 2];              // raw elevation → Three.js Y
                    const tz = -(chunk.positions[i * 3 + 1] - poleNorthing);
                    translated[i * 3 + 0] = tx;
                    translated[i * 3 + 1] = ty;
                    translated[i * 3 + 2] = tz;
                    if (ty < globalMinY) globalMinY = ty;
                    if (Math.abs(tx) < LOCAL_RADIUS && Math.abs(tz) < LOCAL_RADIUS && ty < localMinY) {
                        localMinY = ty;
                    }
                }
                const baseElev = isFinite(localMinY) ? localMinY : globalMinY;
                console.log(`[LiDAR] baseElev=${baseElev.toFixed(1)}m (localMin=${isFinite(localMinY)?localMinY.toFixed(1):'none'}, globalMin=${globalMinY.toFixed(1)})`);

                // Pass 2: shift so the lowest local point sits at Y=0 (ground level).
                for (let i = 0; i < chunk.count; i++) translated[i * 3 + 1] -= baseElev;

                // 5. Elevation-based color gradient.
                //    Each point gets a color based on how high it is relative to the max height.
                //    t = 0 → dark blue (lowest points, likely water/pavement)
                //    t = 0.5 → green (mid-elevation, likely grass/shrubs)
                //    t = 1 → gold (highest points, likely building roofs or treetops)
                //    THREE.Color.lerp() linearly interpolates between two colors.
                const colors = new Float32Array(chunk.count * 3);
                let maxH = 0;
                for (let i = 0; i < chunk.count; i++) {
                    if (translated[i * 3 + 1] > maxH) maxH = translated[i * 3 + 1];
                }
                const cLow  = new THREE.Color(0x1a4a6e); // dark blue
                const cMid  = new THREE.Color(0x5a8a3c); // green (matches placeholder ground)
                const cHigh = new THREE.Color(0xd4a843); // gold
                for (let i = 0; i < chunk.count; i++) {
                    const t = Math.min(translated[i * 3 + 1] / Math.max(maxH, 1), 1);
                    const c = t < 0.5
                        ? cLow.clone().lerp(cMid, t * 2)        // blend low→mid in first half
                        : cMid.clone().lerp(cHigh, (t - 0.5) * 2); // blend mid→high in second half
                    colors[i * 3 + 0] = c.r; // RGB components are 0–1 floats in Three.js
                    colors[i * 3 + 1] = c.g;
                    colors[i * 3 + 2] = c.b;
                }

                // 6. Build Three.js geometry and add to scene.
                //    BufferGeometry holds raw Float32Arrays — the most efficient form
                //    for the GPU. Each attribute (position, color) maps to a vertex shader input.
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(translated, 3)); // 3 floats per point
                geometry.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

                // PointsMaterial renders each vertex as a small square sprite.
                //   size: diameter in world units
                //   vertexColors: true means use the 'color' attribute instead of a single material color
                //   sizeAttenuation: true means points farther from the camera appear smaller (perspective)
                const material = new THREE.PointsMaterial({
                    // 2m per point matches the typical spacing of depth-3 EPT tiles
                    // (~78m average) while still showing dense clusters near the pole.
                    size: 2.0,
                    vertexColors: true,
                    sizeAttenuation: true,
                });

                const pointCloud = new THREE.Points(geometry, material);
                pointCloud.name = 'lidarCloud';

                // Final mount check before modifying the scene
                if (!isMounted) { geometry.dispose(); material.dispose(); return; }

                // Remove the placeholder green ground and grid now that we have real data
                const fg  = scene.getObjectByName('fallbackGround');
                const fgr = scene.getObjectByName('fallbackGrid');
                if (fg)  scene.remove(fg);
                if (fgr) scene.remove(fgr);

                scene.add(pointCloud);

                setLidarPoints(chunk.count);
                setLidarProgress(100);
                setLidarStatus('ready');
                setLidarStage('');

            } catch (err: any) {
                if (!isMounted) return;
                console.error('[PoleViewer3D] LiDAR load failed:', err);
                setLidarStatus('error');
                // The pole model still shows fine — LiDAR is just a visual enhancement
                setLidarError(err.message ?? 'LiDAR unavailable — showing pole only.');
            }
        };

        streamLidar(); // kick off async loading (doesn't block the animation loop)

        // ── CLEANUP ───────────────────────────────────────────────────────────
        // React calls this function when the component unmounts or before re-running
        // the effect (e.g. when `pole` changes). Without cleanup:
        //   - cancelAnimationFrame: the old animation loop keeps running, wasting GPU
        //   - removeEventListener: mouse/wheel events keep firing on the old canvas
        //   - removeChild: old <canvas> elements pile up in the DOM
        //   - renderer.dispose + geometry/material dispose: GPU memory leaks
        return () => {
            isMounted = false; // tell any in-flight async work to stop
            cancelAnimationFrame(animationId);
            renderer.domElement.removeEventListener('mousedown', onMouseDown);
            renderer.domElement.removeEventListener('mousemove', onMouseMove);
            renderer.domElement.removeEventListener('mouseup', onMouseUp);
            renderer.domElement.removeEventListener('wheel', onWheel);
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
            renderer.dispose();
            // Walk every object in the scene and free GPU memory
            scene.traverse((child) => {
                if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
                    child.geometry.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach((m: THREE.Material) => m.dispose());
                    } else {
                        (child.material as THREE.Material).dispose();
                    }
                }
            });
        };
    }, [pole]); // re-run this entire effect whenever the selected pole changes

    // ── JSX / RENDER ─────────────────────────────────────────────────────────
    // The div#mountRef is where Three.js injects its <canvas>.
    // The overlays (loading bar, ready HUD, error badge) are absolutely
    // positioned on top of the canvas using CSS position:absolute.
    return (
        <div style={{ position: 'relative', width: '100%', height: '500px' }}>
            {/* Three.js renders into this div — it appends a <canvas> child */}
            <div ref={mountRef} style={{ width: '100%', height: '500px' }} />

            {/* Loading overlay — visible while tiles are streaming */}
            {(lidarStatus === 'loading' || lidarStatus === 'idle') && (
                <div style={{
                    position: 'absolute', bottom: 12, left: 12,
                    background: 'rgba(0,0,0,0.65)',
                    borderRadius: 8, padding: '8px 14px',
                    color: '#fff', fontFamily: 'monospace', fontSize: 12,
                    minWidth: 220, zIndex: 10,
                }}>
                    <div style={{ color: '#60a5fa', marginBottom: 5 }}>
                        ⚡ Streaming USGS LiDAR...
                    </div>
                    <div style={{ color: '#94a3b8', marginBottom: 8, fontSize: 11 }}>
                        {lidarStage}
                    </div>
                    {/* Progress bar: width% is driven by lidarProgress state (0–100) */}
                    <div style={{
                        width: '100%', height: 4,
                        background: '#1e293b', borderRadius: 2, overflow: 'hidden',
                    }}>
                        <div style={{
                            height: '100%', borderRadius: 2,
                            background: 'linear-gradient(90deg,#3b82f6,#22c55e)',
                            width: `${lidarProgress}%`,
                            transition: 'width 0.4s ease', // smooth bar movement
                        }} />
                    </div>
                </div>
            )}

            {/* Success HUD — shown after LiDAR loads successfully */}
            {lidarStatus === 'ready' && (
                <div style={{
                    position: 'absolute', bottom: 12, left: 12,
                    background: 'rgba(0,0,0,0.55)',
                    borderRadius: 8, padding: '6px 12px',
                    fontFamily: 'monospace', fontSize: 11, zIndex: 10,
                }}>
                    <span style={{ color: '#22c55e' }}>● </span>
                    <span style={{ color: '#94a3b8' }}>
                        USGS 3DEP &nbsp;·&nbsp; {lidarPoints.toLocaleString()} pts
                    </span>
                    <div style={{ color: '#475569', fontSize: 10, marginTop: 2 }}>
                        {lidarDataset}
                    </div>
                </div>
            )}

            {/* Error badge — shown if LiDAR fails (the pole model still displays) */}
            {lidarStatus === 'error' && (
                <div style={{
                    position: 'absolute', bottom: 12, left: 12,
                    background: 'rgba(127,29,29,0.8)',
                    borderRadius: 8, padding: '6px 12px',
                    color: '#fca5a5', fontFamily: 'monospace', fontSize: 11, zIndex: 10,
                }}>
                    ⚠ LiDAR unavailable — {lidarError}
                </div>
            )}
        </div>
    );
};

export default PoleViewer3D;
