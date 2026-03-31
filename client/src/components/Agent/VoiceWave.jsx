import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const VoiceWave = ({ analyser }) => {
    const group = useRef();
    const dataArray = useRef(new Uint8Array(0));
    const rings = useRef([]);

    useEffect(() => {
        if (analyser) {
            dataArray.current = new Uint8Array(analyser.frequencyBinCount);
        }
    }, [analyser]);

    useFrame(() => {
        if (!analyser || dataArray.current.length === 0) return;

        analyser.getByteFrequencyData(dataArray.current);

        // Calculate simplified volume metrics
        const lowerCurrent = dataArray.current.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
        const midCurrent = dataArray.current.slice(10, 50).reduce((a, b) => a + b, 0) / 40;
        const upperCurrent = dataArray.current.slice(50, 100).reduce((a, b) => a + b, 0) / 50;

        // Animate rings
        if (rings.current.length > 0) {
            // Ring 1: Bass / Lower freq (Slow, heavy pulse)
            rings.current[0].scale.setScalar(1 + lowerCurrent / 200);
            rings.current[0].rotation.z += 0.002;

            // Ring 2: Mids (Medium speed)
            rings.current[1].scale.setScalar(1.2 + midCurrent / 200);
            rings.current[1].rotation.z -= 0.005;

            // Ring 3: Highs (Fast jitters)
            rings.current[2].scale.setScalar(1.5 + upperCurrent / 150);
            rings.current[2].rotation.z += 0.01;
        }
    });

    return (
        <group ref={group} rotation={[Math.PI / 2, 0, 0]}>
            {/* Outer Rings */}
            {[0, 1, 2].map((i) => (
                <mesh key={i} ref={(el) => (rings.current[i] = el)}>
                    <torusGeometry args={[2 + i * 0.5, 0.02, 16, 100]} />
                    <meshBasicMaterial
                        color={i === 0 ? "#8B5CF6" : i === 1 ? "#22D3EE" : "#FFFFFF"}
                        transparent
                        opacity={0.3}
                    />
                </mesh>
            ))}
        </group>
    );
};
