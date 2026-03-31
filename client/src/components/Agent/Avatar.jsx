import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

export const Avatar = ({ isSpeaking, analyser }) => {
    const mesh = useRef();
    const dataArray = useRef(new Uint8Array(0));

    useEffect(() => {
        if (analyser) {
            dataArray.current = new Uint8Array(analyser.frequencyBinCount);
        }
    }, [analyser]);

    useFrame((state) => {
        if (mesh.current) {
            // Idle animation
            let intensity = 0;

            if (analyser && isSpeaking && dataArray.current.length > 0) {
                analyser.getByteFrequencyData(dataArray.current);
                // Calculate average volume from frequency data
                const average = dataArray.current.reduce((a, b) => a + b, 0) / dataArray.current.length;
                intensity = average / 255; // Normalize to 0-1
            }

            // Base rotation
            mesh.current.rotation.x = state.clock.getElapsedTime() * 0.2;
            mesh.current.rotation.y = state.clock.getElapsedTime() * 0.3;

            // Reactive animation
            const targetDistort = 0.3 + (intensity * 2.5); // Base 0.3, max ~2.8
            const targetSpeed = 1.5 + (intensity * 10);    // Base 1.5, max ~11.5
            const targetScale = 2 + (intensity * 0.5);     // Pulse scale

            // Smooth interpolation
            mesh.current.material.distort = THREE.MathUtils.lerp(mesh.current.material.distort, targetDistort, 0.1);
            mesh.current.material.speed = THREE.MathUtils.lerp(mesh.current.material.speed, targetSpeed, 0.1);
            mesh.current.scale.setScalar(THREE.MathUtils.lerp(mesh.current.scale.x, targetScale, 0.1));

            // Color shift based on intensity (Violet -> Cyan/White)
            const baseColor = new THREE.Color("#8B5CF6");
            const peakColor = new THREE.Color("#22D3EE");
            mesh.current.material.color.lerpColors(baseColor, peakColor, intensity);
        }
    });

    return (
        <Sphere args={[1, 64, 64]} ref={mesh} scale={2}>
            <MeshDistortMaterial
                color="#8B5CF6"
                attach="material"
                distort={0.3}
                speed={1.5}
                roughness={0.2}
                metalness={0.8}
            />
        </Sphere>
    );
};
