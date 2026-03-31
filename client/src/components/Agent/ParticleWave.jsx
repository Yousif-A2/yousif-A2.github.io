import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const ParticleWave = ({ analyser }) => {
    const points = useRef();
    const dataArray = useRef(new Uint8Array(0));
    const count = 2000; // Number of particles

    // Initialize data array when analyser is ready
    useEffect(() => {
        if (analyser) {
            dataArray.current = new Uint8Array(analyser.frequencyBinCount);
        }
    }, [analyser]);

    // Create initial particle positions (spherical distribution)
    const particlesPosition = useMemo(() => {
        const positions = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const theta = THREE.MathUtils.randFloatSpread(360);
            const phi = THREE.MathUtils.randFloatSpread(360);

            const x = 3 * Math.sin(theta) * Math.cos(phi);
            const y = 3 * Math.sin(theta) * Math.sin(phi);
            const z = 3 * Math.cos(theta);

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
        }

        return positions;
    }, [count]);

    useFrame((state) => {
        if (!analyser || dataArray.current.length === 0 || !points.current) return;

        analyser.getByteFrequencyData(dataArray.current);

        // Calculate average volume
        const average = dataArray.current.reduce((a, b) => a + b, 0) / dataArray.current.length;
        const boost = average / 50; // Audio reactivity factor

        // Rotate the entire cloud
        points.current.rotation.y += 0.002;
        points.current.rotation.z += 0.001;

        // Pulse scale based on volume
        const targetScale = 1 + boost * 0.5;
        points.current.scale.setScalar(THREE.MathUtils.lerp(points.current.scale.x, targetScale, 0.1));

        // Color shift
        const baseColor = new THREE.Color("#8B5CF6");
        const peakColor = new THREE.Color("#22D3EE");
        points.current.material.color.lerpColors(baseColor, peakColor, boost / 5);
    });

    return (
        <points ref={points}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={particlesPosition.length / 3}
                    array={particlesPosition}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial
                size={0.05}
                color="#8B5CF6"
                sizeAttenuation={true}
                transparent={true}
                opacity={0.8}
                blending={THREE.AdditiveBlending}
            />
        </points>
    );
};
