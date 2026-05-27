import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Pole } from '../types/Pole';

interface PoleViewer3DProps {
    pole: Pole;
}

const PoleViewer3D: React.FC<PoleViewer3DProps> = ({ pole }) => {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!mountRef.current) return;
        const container = mountRef.current;

        // ============================================
        // SCENE SETUP
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
        // MANUAL ORBIT CONTROLS
        // Built from scratch to avoid import issues
        // ============================================
        let isMouseDown = false;
        let mouseX = 0;
        let mouseY = 0;
        let sphericalTheta = Math.PI / 4;  // Horizontal angle
        let sphericalPhi = Math.PI / 3;    // Vertical angle
        let radius = 25;                    // Distance from pole
        const target = new THREE.Vector3(0, pole.height * 0.5, 0);

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
        // LIGHTING
        // ============================================
        const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
        sunLight.position.set(10, 20, 10);
        sunLight.castShadow = true;
        scene.add(sunLight);
        scene.add(new THREE.AmbientLight(0x606060, 1.0));

        // ============================================
        // GROUND + GRID
        // ============================================
        const groundGeo = new THREE.PlaneGeometry(50, 50);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0x5a8a3c });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const grid = new THREE.GridHelper(50, 20, 0x000000, 0x000000);
        grid.position.y = 0.01;
        (grid.material as THREE.Material).opacity = 0.15;
        (grid.material as THREE.Material).transparent = true;
        scene.add(grid);

        // ============================================
        // POLE COLOR — clearly different per condition
        // ============================================
        console.log('Pole condition:', pole.condition); // Debug

        let poleColor: number;
        if (pole.condition === 'Good') {
            poleColor = 0x00AA00;  // Strong green
        } else if (pole.condition === 'Fair') {
            poleColor = 0xFF8800;  // Strong orange
        } else {
            poleColor = 0xCC0000;  // Strong red
        }

        console.log('Pole color hex:', poleColor.toString(16)); // Debug

        const poleGeo = new THREE.CylinderGeometry(0.15, 0.25, pole.height, 12);
        const poleMat = new THREE.MeshLambertMaterial({ color: poleColor });
        const poleMesh = new THREE.Mesh(poleGeo, poleMat);
        poleMesh.position.y = pole.height / 2;
        poleMesh.castShadow = true;
        scene.add(poleMesh);

        // ============================================
        // ATTACHMENTS
        // ============================================
        const attachmentColors: Record<string, number> = {
            Power:   0xFF2222,
            Telecom: 0x2244FF,
            Fiber:   0x00DD44
        };

        pole.attachments.forEach((att) => {
            // Crossarm
            const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 6, 8);
            const armMat = new THREE.MeshLambertMaterial({ color: 0x4A3728 });
            const arm = new THREE.Mesh(armGeo, armMat);
            arm.rotation.z = Math.PI / 2;
            arm.position.y = att.height;
            scene.add(arm);

            const wColor = attachmentColors[att.type] || 0xFFFFFF;

            // Insulators
            const insGeo = new THREE.SphereGeometry(0.18, 8, 8);
            const insMat = new THREE.MeshLambertMaterial({ color: wColor });

            [-3, 3].forEach(xPos => {
                const ins = new THREE.Mesh(insGeo, insMat);
                ins.position.set(xPos, att.height, 0);
                scene.add(ins);
            });

            // Sagging wire
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
        // CONDITION BALL ON TOP
        // ============================================
        const ballColor = pole.condition === 'Good'
            ? 0x00FF00
            : pole.condition === 'Fair'
            ? 0xFF8800
            : 0xFF0000;

        const ballGeo = new THREE.SphereGeometry(0.4, 16, 16);
        const ballMat = new THREE.MeshBasicMaterial({ color: ballColor });
        const ball = new THREE.Mesh(ballGeo, ballMat);
        ball.position.y = pole.height + 0.7;
        scene.add(ball);

        // ============================================
        // ANIMATION LOOP
        // ============================================
        let animationId: number;

        const animate = () => {
            animationId = requestAnimationFrame(animate);
            renderer.render(scene, camera);
        };
        animate();

        // ============================================
        // CLEANUP
        // ============================================
        return () => {
            cancelAnimationFrame(animationId);
            renderer.domElement.removeEventListener('mousedown', onMouseDown);
            renderer.domElement.removeEventListener('mousemove', onMouseMove);
            renderer.domElement.removeEventListener('mouseup', onMouseUp);
            renderer.domElement.removeEventListener('wheel', onWheel);
            container.removeChild(renderer.domElement);
            renderer.dispose();
            scene.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    (child.material as THREE.Material).dispose();
                }
            });
        };
    }, [pole]);

    return <div ref={mountRef} style={{ width: '100%', height: '500px' }} />;
};

export default PoleViewer3D;