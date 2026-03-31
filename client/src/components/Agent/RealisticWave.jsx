import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const vertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform float uTime;
uniform float uAudioLevels[10]; // Simplified audio buckets
varying vec2 vUv;

// Function to generate a smooth wave line
float line(vec2 uv, float offset, float height, float width, vec3 color) {
    float y = sin(uv.x * 5.0 + uTime * 2.0 + offset) * height; // Main wave movement
    
    // Add some noise/variation based on audio (simulated here for smoothness)
    // We mix in the audio level to modulate the amplitude
    float amplitudeMod = 1.0 + uAudioLevels[int(uv.x * 9.0)] * 2.0;
    y *= amplitudeMod;
    
    float dist = abs(uv.y - y);
    float glow = width / dist;
    glow = pow(glow, 1.5); // Sharpen the line
    return glow;
}

void main() {
    vec3 finalColor = vec3(0.0);
    
    // Define bucketed audio levels (normalized in JS)
    float bass = uAudioLevels[0];
    float mids = uAudioLevels[4];
    float highs = uAudioLevels[8];

    // Wave 1: Cyan/Blue (Base)
    float wave1 = sin(vUv.x * 3.0 + uTime * 1.0) * (0.2 + bass * 0.3);
    float dist1 = abs(vUv.y - wave1);
    float glow1 = 0.02 / dist1;
    finalColor += vec3(0.0, 0.8, 1.0) * glow1 * 0.8;

    // Wave 2: Purple (Mids)
    float wave2 = sin(vUv.x * 4.0 + uTime * 1.5 + 2.0) * (0.15 + mids * 0.3);
    float dist2 = abs(vUv.y - wave2);
    float glow2 = 0.02 / dist2;
    finalColor += vec3(0.6, 0.0, 1.0) * glow2 * 0.8;
    
    // Wave 3: Pink/White (Highs/Accent)
    float wave3 = sin(vUv.x * 5.0 + uTime * 2.0 + 4.0) * (0.1 + highs * 0.3);
    float dist3 = abs(vUv.y - wave3);
    float glow3 = 0.02 / dist3;
    finalColor += vec3(1.0, 0.2, 0.8) * glow3 * 0.5;

    // Global fade at edges
    float alpha = smoothstep(0.0, 0.2, vUv.x) * (1.0 - smoothstep(0.8, 1.0, vUv.x));
    
    gl_FragColor = vec4(finalColor, alpha);
}
`;

export const RealisticWave = ({ analyser }) => {
    const mesh = useRef();

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uAudioLevels: { value: new Float32Array(10) }
    }), []);

    const dataArray = useRef(new Uint8Array(0));

    useFrame((state) => {
        if (!mesh.current || !analyser) return;

        // Init data array if needed
        if (dataArray.current.length === 0) {
            dataArray.current = new Uint8Array(analyser.frequencyBinCount);
        }

        analyser.getByteFrequencyData(dataArray.current);

        // Update time
        mesh.current.material.uniforms.uTime.value = state.clock.getElapsedTime();

        // Calculate simplified buckets for the shader (averaging chunks of the spectrum)
        // We want ~10 distinct levels to drive different parts of the wave
        const bucketSize = Math.floor(dataArray.current.length / 10);
        const levels = mesh.current.material.uniforms.uAudioLevels.value;

        for (let i = 0; i < 10; i++) {
            let sum = 0;
            for (let j = 0; j < bucketSize; j++) {
                sum += dataArray.current[i * bucketSize + j];
            }
            // Normalize to 0-1 with some boost
            levels[i] = (sum / bucketSize) / 255.0;
        }
    });

    return (
        <mesh ref={mesh} position={[0, 0, 1.5]} scale={[10, 3, 1]}>
            <planeGeometry args={[1, 1, 32, 32]} />
            <shaderMaterial
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                transparent={true}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </mesh>
    );
};
