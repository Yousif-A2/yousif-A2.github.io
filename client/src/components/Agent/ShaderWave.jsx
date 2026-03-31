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
uniform sampler2D uAudioTexture;
varying vec2 vUv;

vec3 colorA = vec3(0.5, 0.0, 1.0); // Purple
vec3 colorB = vec3(0.0, 1.0, 1.0); // Cyan

void main() {
    // Mirror UV y to create symmetry
    float symmetryY = abs(vUv.y - 0.5) * 2.0;
    
    // Sample audio data based on X coordinate
    // We ignore Y for sampling to get a vertical bar/wave effect across X
    float audioValue = texture2D(uAudioTexture, vec2(vUv.x, 0.0)).r;
    
    // Create the wave shape
    // The wave amplitude decreases as we get further from the center Y line
    // We add some sine waves for movement even when silent-ish
    float wave = audioValue * 0.8;
    float movement = sin(vUv.x * 10.0 + uTime * 2.0) * 0.1 * audioValue;
    float combinedShape = wave + movement;

    // Softness/Glow calculation
    // Distance from center line (0.0) to current ripple height
    float distance = symmetryY - combinedShape;
    
    // Sharpness of the edge
    float glow = 1.0 - smoothstep(0.0, 0.1, distance);
    
    // Add a thin line at the exact wave height
    float line = 1.0 - smoothstep(0.0, 0.02, abs(distance));
    
    vec3 finalColor = mix(colorA, colorB, vUv.x);
    
    // Combine glow and line
    float alpha = glow * 0.5 + line;
    
    gl_FragColor = vec4(finalColor, alpha * audioValue); // Fade out with quiet audio
}
`;

export const ShaderWave = ({ analyser }) => {
    const mesh = useRef();

    // Create a DataTexture to hold audio frequency data
    // 128 bins is plenty for a visualizer (analyser usually has 256 or more)
    const dataTexture = useMemo(() => {
        const size = 128;
        const data = new Uint8Array(size); // Placeholder
        const texture = new THREE.DataTexture(
            data,
            size,
            1,
            THREE.RedFormat,
            THREE.UnsignedByteType,
            THREE.UVMapping
        );
        texture.needsUpdate = true;
        return texture;
    }, []);

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uAudioTexture: { value: dataTexture }
    }), [dataTexture]);

    // Temp array for reading analyser
    const tempArray = useRef(new Uint8Array(128));

    useFrame((state) => {
        if (!mesh.current || !analyser) return;

        // Update Uniforms
        mesh.current.material.uniforms.uTime.value = state.clock.getElapsedTime();

        // Update Texture with Audio Data
        // fftSize must be >= 2 * texture width (128 * 2 = 256)
        if (analyser.frequencyBinCount >= 128) {
            analyser.getByteFrequencyData(tempArray.current);
            // Copy to texture
            dataTexture.image.data.set(tempArray.current);
            dataTexture.needsUpdate = true;
        }
    });

    return (
        <mesh ref={mesh} position={[0, -1.5, 0]} scale={[8, 4, 1]}>
            <planeGeometry args={[1, 1, 64, 64]} />
            <shaderMaterial
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                transparent={true}
                side={THREE.DoubleSide}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
            />
        </mesh>
    );
};
