import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const CURVE_SEGMENTS = 100;
const WAVE_COUNT = 5; // Number of layered waves (to create that "multi-line" look)

export const LinearWave = ({ analyser }) => {
    const group = useRef();
    const dataArray = useRef(new Uint8Array(0));

    // Create multiple lines
    const lines = useMemo(() => Array.from({ length: WAVE_COUNT }), []);

    useEffect(() => {
        if (analyser) {
            dataArray.current = new Uint8Array(analyser.frequencyBinCount);
        }
    }, [analyser]);

    useFrame((state) => {
        if (!analyser || dataArray.current.length === 0 || !group.current) return;

        analyser.getByteFrequencyData(dataArray.current);

        // Calculate average for overall scale
        const average = dataArray.current.reduce((a, b) => a + b, 0) / dataArray.current.length;
        const boost = average / 255;

        // Update each line
        group.current.children.forEach((mesh, index) => {
            const time = state.clock.getElapsedTime();
            const positions = mesh.geometry.attributes.position.array;

            for (let i = 0; i < CURVE_SEGMENTS; i++) {
                // Normalized x from -1 to 1
                const x = (i / (CURVE_SEGMENTS - 1)) * 2 - 1;

                // Map audio data to frequency index (focus on lower-mids for better visualization)
                const freqIndex = Math.floor((i / CURVE_SEGMENTS) * (dataArray.current.length / 2));
                const audioValue = dataArray.current[freqIndex] / 255; // 0 to 1

                // Create a smooth wave shape (sine + audio modulation)
                // Offset/Phase shift per line
                const phase = index * 0.5;
                const sineWave = Math.sin(x * 3 + time * 3 + phase);
                const combinedY = sineWave * audioValue * 2 * boost; // Scale by audio

                // Attenuate edges to zero (to constrain the wave ends)
                const attenuation = 1 - Math.pow(Math.abs(x), 2); // Parabola falloff

                positions[i * 3] = x * 6; // Stretch X
                positions[i * 3 + 1] = combinedY * attenuation; // Y
                positions[i * 3 + 2] = index * 0.1; // Slight Z offset
            }

            mesh.geometry.attributes.position.needsUpdate = true;

            // Pulse color
            // mesh.material.opacity = 0.3 + boost * 0.5;
        });
    });

    return (
        <group ref={group} position={[0, -1, 0]}>
            {lines.map((_, i) => (
                <line key={i}>
                    <bufferGeometry>
                        <bufferAttribute
                            attach="attributes-position"
                            count={CURVE_SEGMENTS}
                            array={new Float32Array(CURVE_SEGMENTS * 3)}
                            itemSize={3}
                        />
                    </bufferGeometry>
                    <lineBasicMaterial
                        color={new THREE.Color().setHSL(0.6 + i * 0.1, 1, 0.5)} // Blue -> Purple range
                        transparent
                        opacity={0.5}
                        linewidth={2}
                    />
                </line>
            ))}
        </group>
    );
};
