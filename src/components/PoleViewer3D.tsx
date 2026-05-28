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

        const poleHeight = pole.height ?? 40; // default to 40 ft when OSM omits the tag

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
        camera.position.set(15, poleHeight * 0.7, 20);
        camera.lookAt(0, poleHeight * 0.5, 0);

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
        const target = new THREE.Vector3(0, poleHeight * 0.5, 0);

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
        const poleGeo = new THREE.CylinderGeometry(0.15, 0.25, poleHeight, 12);
        const poleMat = new THREE.MeshLambertMaterial({ color: 0x5C3D1E }); // creosote-treated wood
        const poleMesh = new THREE.Mesh(poleGeo, poleMat);
        poleMesh.position.y = poleHeight / 2;
        poleMesh.castShadow = true;
        scene.add(poleMesh);

        // ── CROSSARM ──────────────────────────────────────────────────────────
        // One crossarm near the top of the pole with two diagonal braces below it.
        // Real utility crossarms are ~8–10 ft wide and mounted ~85% up the pole.
        const armY       = poleHeight * 0.85;
        const armHalfLen = 4.5; // 9 ft total span
        const armMat     = new THREE.MeshLambertMaterial({ color: 0x4A2E10 });

        const armGeo = new THREE.CylinderGeometry(0.08, 0.10, armHalfLen * 2, 8);
        const arm    = new THREE.Mesh(armGeo, armMat);
        arm.rotation.z = Math.PI / 2; // rotate vertical cylinder to horizontal
        arm.position.y = armY;
        scene.add(arm);


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

                // 3. Stream point cloud tiles near the pole.
                //    minDepth=2 skips the coarse root/level-1 tiles that cover the whole
                //    250 km dataset — loading those first would exhaust the point budget
                //    before we reach the fine-grained tiles near the pole.
                //    centerX/centerY + radiusMeters narrows the tile search to a 50 km
                //    circle around the pole so we don't fetch the entire dataset.
                const [centerX, centerY] = latLngToWebMercator(pole.latitude, pole.longitude);
                setLidarStage('Streaming point cloud tiles...');
                const chunk = await loadEptPointCloud(dataset.eptUrl, manifest, {
                    maxPoints: 400_000,
                    maxDepth: 4,
                    minDepth: 3,
                    centerX,
                    centerY,
                    radiusMeters: 15_000,
                    onProgress: (loaded, total) => {
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

                // Pass 1: centre XZ on the pole; find the elevation baseline.
                //
                // We want Y=0 in Three.js to equal the terrain elevation at the pole.
                // Strategy: find the LiDAR point nearest to the pole horizontally —
                // its Z is our best available estimate of the ground at that location.
                // Fallbacks: local minimum within 10 km, then global minimum.
                //
                // We do NOT use the local minimum directly because it may be from a
                // river valley or depression kilometres away, which would push the
                // Fayette County plateau (~270 m AMSL) up to Y≈200 in Three.js,
                // far above the camera (at ~32 m) and the pole model (0–40 units).
                const translated = new Float32Array(chunk.count * 3);
                let nearestDist2 = Infinity;
                let nearestZ     = NaN;
                let localMinY    = Infinity;
                let globalMinY   = Infinity;
                const LOCAL_RADIUS = 10_000; // metres for localMin fallback

                for (let i = 0; i < chunk.count; i++) {
                    const tx = chunk.positions[i * 3 + 0] - poleEasting;
                    const ty = chunk.positions[i * 3 + 2];   // raw elevation → Three.js Y
                    const tz = -(chunk.positions[i * 3 + 1] - poleNorthing);
                    translated[i * 3 + 0] = tx;
                    translated[i * 3 + 1] = ty;
                    translated[i * 3 + 2] = tz;
                    if (ty < globalMinY) globalMinY = ty;
                    if (Math.abs(tx) < LOCAL_RADIUS && Math.abs(tz) < LOCAL_RADIUS && ty < localMinY) localMinY = ty;
                    // Track nearest point with a plausible above-sea-level Z
                    if (ty > 0) {
                        const d2 = tx * tx + tz * tz;
                        if (d2 < nearestDist2) { nearestDist2 = d2; nearestZ = ty; }
                    }
                }

                const baseElev = isFinite(nearestZ) ? nearestZ
                    : isFinite(localMinY) ? localMinY
                    : globalMinY;
                const nearestM = isFinite(nearestDist2) ? Math.sqrt(nearestDist2).toFixed(0) : 'n/a';
                console.log(`[LiDAR] baseElev=${baseElev.toFixed(1)}m — nearest=${isFinite(nearestZ)?nearestZ.toFixed(1):'none'} @${nearestM}m, localMin=${isFinite(localMinY)?localMinY.toFixed(1):'none'}, globalMin=${globalMinY.toFixed(1)}`);

                // Pass 2: shift so the nearest-point terrain is at Y=0 (pole base level).
                for (let i = 0; i < chunk.count; i++) translated[i * 3 + 1] -= baseElev;

                // Z-clamp: discard outlier points more than 20m below or 50m above ground.
                // Raw LiDAR can include underground noise, birds, and low-flying aircraft.
                const CLAMP_MIN = -20;
                const CLAMP_MAX = 50;
                let validCount = 0;
                for (let i = 0; i < chunk.count; i++) {
                    const y = translated[i * 3 + 1];
                    if (y >= CLAMP_MIN && y <= CLAMP_MAX) validCount++;
                }
                const filteredPos = new Float32Array(validCount * 3);
                let fi = 0;
                for (let i = 0; i < chunk.count; i++) {
                    const y = translated[i * 3 + 1];
                    if (y >= CLAMP_MIN && y <= CLAMP_MAX) {
                        filteredPos[fi * 3 + 0] = translated[i * 3 + 0];
                        filteredPos[fi * 3 + 1] = y;
                        filteredPos[fi * 3 + 2] = translated[i * 3 + 2];
                        fi++;
                    }
                }
                console.log(`[LiDAR] Z-clamp [${CLAMP_MIN},${CLAMP_MAX}]m kept ${validCount}/${chunk.count} pts`);

                // 5. Elevation-based color gradient.
                //    Each point gets a color based on how high it is relative to the max height.
                //    t = 0 → dark blue (lowest points, likely water/pavement)
                //    t = 0.5 → green (mid-elevation, likely grass/shrubs)
                //    t = 1 → gold (highest points, likely building roofs or treetops)
                //    THREE.Color.lerp() linearly interpolates between two colors.
                const colors = new Float32Array(validCount * 3);
                let maxH = 0;
                for (let i = 0; i < validCount; i++) {
                    if (filteredPos[i * 3 + 1] > maxH) maxH = filteredPos[i * 3 + 1];
                }
                const cLow  = new THREE.Color(0x1a4a6e); // dark blue
                const cMid  = new THREE.Color(0x5a8a3c); // green (matches placeholder ground)
                const cHigh = new THREE.Color(0xd4a843); // gold
                for (let i = 0; i < validCount; i++) {
                    const t = Math.min(filteredPos[i * 3 + 1] / Math.max(maxH, 1), 1);
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
                geometry.setAttribute('position', new THREE.BufferAttribute(filteredPos, 3)); // 3 floats per point
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

                setLidarPoints(validCount);
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
