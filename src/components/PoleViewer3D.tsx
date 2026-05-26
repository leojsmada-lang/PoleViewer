/**
 * PoleViewer3D.tsx  (LiDAR-enhanced version)
 *
 * Drop-in replacement for your existing PoleViewer3D.tsx.
 * Keeps your exact manual orbit controls, same cleanup pattern,
 * same Pole import from '../types/Pole' — just adds USGS LiDAR
 * point cloud streaming beneath the pole model.
 *
 * New dependencies:
 *   npm install laz-perf
 *   (three is already installed)
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Pole } from '../types/Pole';
import { findDatasetsForLocation, fetchEptManifest } from '../services/lidarService';
import { loadEptPointCloud } from '../services/eptLoader';

interface PoleViewer3DProps {
    pole: Pole;
}

// ─── Attachment wire colors (same as your original) ──────────────────────────
const attachmentColors: Record<string, number> = {
    Power:   0xFF2222,
    Telecom: 0x2244FF,
    Fiber:   0x00DD44,
};

const PoleViewer3D: React.FC<PoleViewer3DProps> = ({ pole }) => {
    const mountRef = useRef<HTMLDivElement>(null);

    // LiDAR loading state — drives the overlay UI only
    const [lidarStatus, setLidarStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const [lidarProgress, setLidarProgress] = useState(0);
    const [lidarStage, setLidarStage] = useState('');
    const [lidarDataset, setLidarDataset] = useState('');
    const [lidarPoints, setLidarPoints] = useState(0);
    const [lidarError, setLidarError] = useState('');

    useEffect(() => {
        if (!mountRef.current) return;
        const container = mountRef.current;

        // Reset LiDAR status on pole change
        setLidarStatus('idle');
        setLidarProgress(0);
        setLidarError('');

        // ============================================
        // SCENE SETUP  (identical to your original)
        // ============================================
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87CEEB);

        const width = container.clientWidth || 800;
        const height = 500;

        const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
        camera.position.set(15, pole.height * 0.7, 20);
        camera.lookAt(0, pole.height * 0.5, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.shadowMap.enabled = true;
        container.appendChild(renderer.domElement);

        // ============================================
        // MANUAL ORBIT CONTROLS  (your original code, unchanged)
        // ============================================
        let isMouseDown = false;
        let mouseX = 0;
        let mouseY = 0;
        let sphericalTheta = Math.PI / 4;
        let sphericalPhi = Math.PI / 3;
        let radius = 25;
        const target = new THREE.Vector3(0, pole.height * 0.5, 0);

        const updateCamera = () => {
            camera.position.x = target.x + radius * Math.sin(sphericalPhi) * Math.sin(sphericalTheta);
            camera.position.y = target.y + radius * Math.cos(sphericalPhi);
            camera.position.z = target.z + radius * Math.sin(sphericalPhi) * Math.cos(sphericalTheta);
            camera.lookAt(target);
        };
        updateCamera();

        const onMouseDown = (e: MouseEvent) => { isMouseDown = true; mouseX = e.clientX; mouseY = e.clientY; };
        const onMouseMove = (e: MouseEvent) => {
            if (!isMouseDown) return;
            const deltaX = e.clientX - mouseX;
            const deltaY = e.clientY - mouseY;
            mouseX = e.clientX;
            mouseY = e.clientY;
            sphericalTheta -= deltaX * 0.01;
            sphericalPhi = Math.max(0.1, Math.min(Math.PI / 2, sphericalPhi + deltaY * 0.01));
            updateCamera();
        };
        const onMouseUp = () => { isMouseDown = false; };
        const onWheel = (e: WheelEvent) => {
            radius = Math.max(5, Math.min(80, radius + e.deltaY * 0.05));
            updateCamera();
        };

        renderer.domElement.addEventListener('mousedown', onMouseDown);
        renderer.domElement.addEventListener('mousemove', onMouseMove);
        renderer.domElement.addEventListener('mouseup', onMouseUp);
        renderer.domElement.addEventListener('wheel', onWheel);

        // ============================================
        // LIGHTING  (your original)
        // ============================================
        const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
        sunLight.position.set(10, 20, 10);
        sunLight.castShadow = true;
        scene.add(sunLight);
        scene.add(new THREE.AmbientLight(0x606060, 1.0));

        // ============================================
        // GROUND + GRID  (your original — shown while LiDAR loads)
        // ============================================
        const groundGeo = new THREE.PlaneGeometry(100, 100);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0x5a8a3c });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        ground.name = 'fallbackGround';
        scene.add(ground);

        const grid = new THREE.GridHelper(100, 40, 0x000000, 0x000000);
        grid.position.y = 0.01;
        (grid.material as THREE.Material).opacity = 0.15;
        (grid.material as THREE.Material).transparent = true;
        grid.name = 'fallbackGrid';
        scene.add(grid);

        // ============================================
        // POLE COLOR  (your original)
        // ============================================
        let poleColor: number;
        if (pole.condition === 'Good')       poleColor = 0x00AA00;
        else if (pole.condition === 'Fair')  poleColor = 0xFF8800;
        else                                  poleColor = 0xCC0000;

        const poleGeo = new THREE.CylinderGeometry(0.15, 0.25, pole.height, 12);
        const poleMat = new THREE.MeshLambertMaterial({ color: poleColor });
        const poleMesh = new THREE.Mesh(poleGeo, poleMat);
        poleMesh.position.y = pole.height / 2;
        poleMesh.castShadow = true;
        scene.add(poleMesh);

        // ============================================
        // ATTACHMENTS  (your original)
        // ============================================
        pole.attachments.forEach((att) => {
            const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 6, 8);
            const armMat = new THREE.MeshLambertMaterial({ color: 0x4A3728 });
            const arm = new THREE.Mesh(armGeo, armMat);
            arm.rotation.z = Math.PI / 2;
            arm.position.y = att.height;
            scene.add(arm);

            const wColor = attachmentColors[att.type] || 0xFFFFFF;

            const insGeo = new THREE.SphereGeometry(0.18, 8, 8);
            const insMat = new THREE.MeshLambertMaterial({ color: wColor });
            [-3, 3].forEach(xPos => {
                const ins = new THREE.Mesh(insGeo, insMat);
                ins.position.set(xPos, att.height, 0);
                scene.add(ins);
            });

            const wirePoints: THREE.Vector3[] = [];
            for (let i = 0; i <= 20; i++) {
                const t = i / 20;
                const x = -3 + t * 6;
                const sag = Math.sin(t * Math.PI) * 0.5;
                wirePoints.push(new THREE.Vector3(x, att.height - sag, 0));
            }
            const wireGeo = new THREE.BufferGeometry().setFromPoints(wirePoints);
            const wireLineMat = new THREE.LineBasicMaterial({ color: wColor });
            scene.add(new THREE.Line(wireGeo, wireLineMat));
        });

        // ============================================
        // CONDITION BALL ON TOP  (your original)
        // ============================================
        const ballColor = pole.condition === 'Good' ? 0x00FF00
            : pole.condition === 'Fair' ? 0xFF8800 : 0xFF0000;
        const ballGeo = new THREE.SphereGeometry(0.4, 16, 16);
        const ballMat = new THREE.MeshBasicMaterial({ color: ballColor });
        const ball = new THREE.Mesh(ballGeo, ballMat);
        ball.position.y = pole.height + 0.7;
        scene.add(ball);

        // ============================================
        // ANIMATION LOOP  (your original)
        // ============================================
        let animationId: number;
        const animate = () => {
            animationId = requestAnimationFrame(animate);
            renderer.render(scene, camera);
        };
        animate();

        // ============================================
        // LIDAR STREAMING  (new — async, non-blocking)
        // Runs after the scene is already rendering.
        // Replaces the green ground + grid with real
        // USGS point cloud data when it arrives.
        // ============================================
        let isMounted = true; // guard against cleanup race

        const streamLidar = async () => {
            setLidarStatus('loading');
            setLidarStage('Searching USGS 3DEP catalog...');
            setLidarProgress(5);

            try {
                // 1. Find which USGS dataset covers this pole's location
                const datasets = await findDatasetsForLocation(pole.latitude, pole.longitude);
                if (!isMounted) return;

                if (datasets.length === 0) {
                    setLidarStatus('error');
                    setLidarError('No LiDAR coverage for this location.');
                    return;
                }

                const dataset = datasets[0];
                setLidarDataset(dataset.name);
                setLidarStage(`Found: ${dataset.name}`);
                setLidarProgress(15);

                // 2. Fetch the tiny ept.json manifest (~1KB)
                setLidarStage('Fetching EPT manifest...');
                const manifest = await fetchEptManifest(dataset.eptUrl);
                if (!isMounted) return;
                setLidarProgress(25);

                // 3. Stream point cloud tiles (depth 3 = ~300K pts, ~5-10s)
                setLidarStage('Streaming point cloud tiles...');
                const chunk = await loadEptPointCloud(dataset.eptUrl, manifest, {
                    maxPoints: 400_000,
                    maxDepth: 3,
                    onProgress: (loaded, total) => {
                        if (isMounted) setLidarProgress(25 + Math.floor((loaded / total) * 65));
                    },
                });
                if (!isMounted) return;

                if (chunk.count === 0) throw new Error('No points decoded');

                setLidarStage('Building geometry...');
                setLidarProgress(93);

                // 4. Center point cloud at world origin + remap Z-up → Y-up
                //    EPT uses projected CRS (meters). We center on the
                //    centroid so the pole always sits in the middle.
                let cx = 0, cy = 0, cz = 0;
                for (let i = 0; i < chunk.count; i++) {
                    cx += chunk.positions[i * 3 + 0];
                    cy += chunk.positions[i * 3 + 1];
                    cz += chunk.positions[i * 3 + 2];
                }
                cx /= chunk.count; cy /= chunk.count; cz /= chunk.count;

                const translated = new Float32Array(chunk.count * 3);
                let minY = Infinity;
                for (let i = 0; i < chunk.count; i++) {
                    translated[i * 3 + 0] = chunk.positions[i * 3 + 0] - cx;       // X stays X
                    translated[i * 3 + 1] = chunk.positions[i * 3 + 2] - cz;       // Z (up) → Y
                    translated[i * 3 + 2] = -(chunk.positions[i * 3 + 1] - cy);    // Y → -Z
                    if (translated[i * 3 + 1] < minY) minY = translated[i * 3 + 1];
                }
                // Shift ground plane to y = 0 so it lines up with the pole base
                for (let i = 0; i < chunk.count; i++) translated[i * 3 + 1] -= minY;

                // 5. Elevation-based color gradient: dark blue → green → gold
                const colors = new Float32Array(chunk.count * 3);
                let maxH = 0;
                for (let i = 0; i < chunk.count; i++) {
                    if (translated[i * 3 + 1] > maxH) maxH = translated[i * 3 + 1];
                }
                const cLow  = new THREE.Color(0x1a4a6e);
                const cMid  = new THREE.Color(0x5a8a3c);  // matches your ground color
                const cHigh = new THREE.Color(0xd4a843);
                for (let i = 0; i < chunk.count; i++) {
                    const t = Math.min(translated[i * 3 + 1] / Math.max(maxH, 1), 1);
                    const c = t < 0.5
                        ? cLow.clone().lerp(cMid, t * 2)
                        : cMid.clone().lerp(cHigh, (t - 0.5) * 2);
                    colors[i * 3 + 0] = c.r;
                    colors[i * 3 + 1] = c.g;
                    colors[i * 3 + 2] = c.b;
                }

                // 6. Build Three.js Points and swap into the scene
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(translated, 3));
                geometry.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

                const material = new THREE.PointsMaterial({
                    size: 0.18,
                    vertexColors: true,
                    sizeAttenuation: true,
                });

                const pointCloud = new THREE.Points(geometry, material);
                pointCloud.name = 'lidarCloud';

                if (!isMounted) { geometry.dispose(); material.dispose(); return; }

                // Remove the placeholder green ground + grid
                const fg = scene.getObjectByName('fallbackGround');
                const fgr = scene.getObjectByName('fallbackGrid');
                if (fg) scene.remove(fg);
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
                setLidarError(err.message ?? 'LiDAR unavailable — showing pole only.');
            }
        };

        streamLidar();

        // ============================================
        // CLEANUP  (your original pattern + LiDAR guard)
        // ============================================
        return () => {
            isMounted = false;
            cancelAnimationFrame(animationId);
            renderer.domElement.removeEventListener('mousedown', onMouseDown);
            renderer.domElement.removeEventListener('mousemove', onMouseMove);
            renderer.domElement.removeEventListener('mouseup', onMouseUp);
            renderer.domElement.removeEventListener('wheel', onWheel);
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
            renderer.dispose();
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
    }, [pole]);

    // ============================================
    // RENDER — your original div + LiDAR overlay
    // ============================================
    return (
        <div style={{ position: 'relative', width: '100%', height: '500px' }}>
            {/* Three.js canvas mount — same as your original */}
            <div ref={mountRef} style={{ width: '100%', height: '500px' }} />

            {/* LiDAR loading overlay — only visible while streaming */}
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
                    <div style={{
                        width: '100%', height: 4,
                        background: '#1e293b', borderRadius: 2, overflow: 'hidden',
                    }}>
                        <div style={{
                            height: '100%', borderRadius: 2,
                            background: 'linear-gradient(90deg,#3b82f6,#22c55e)',
                            width: `${lidarProgress}%`,
                            transition: 'width 0.4s ease',
                        }} />
                    </div>
                </div>
            )}

            {/* LiDAR ready HUD — bottom-left, unobtrusive */}
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

            {/* Error badge — only if LiDAR failed (pole still shows fine) */}
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
