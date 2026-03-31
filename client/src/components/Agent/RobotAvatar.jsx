import React, { useEffect, useRef, useState } from 'react';

/**
 * RobotAvatar — a dynamic, voice-reactive image avatar.
 *
 * Props:
 *   isSpeaking  {boolean}  — the AI is speaking (TTS playing)
 *   isListening {boolean}  — user microphone is active
 *   analyser    {AnalyserNode|null} — Web Audio analyser for amplitude data
 */
export const RobotAvatar = ({ isSpeaking, isListening, analyser }) => {
    const [amplitude, setAmplitude] = useState(0);
    const animFrameRef = useRef(null);
    const dataArrayRef = useRef(null);

    // Poll the audio analyser for amplitude data
    useEffect(() => {
        if (!analyser) return;

        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
            analyser.getByteFrequencyData(dataArrayRef.current);
            const avg =
                dataArrayRef.current.reduce((a, b) => a + b, 0) /
                dataArrayRef.current.length;
            setAmplitude(avg / 255); // 0–1
            animFrameRef.current = requestAnimationFrame(tick);
        };

        animFrameRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [analyser]);

    // Compute dynamic scale / glow based on amplitude + state
    const glowIntensity = isSpeaking ? 0.4 + amplitude * 0.6 : isListening ? 0.25 : 0.12;
    const ringScale = isSpeaking ? 1 + amplitude * 0.08 : 1;
    const glowColorOuter = isSpeaking ? '#f97316' : isListening ? '#22d3ee' : '#8b5cf6'; // orange / cyan / violet
    const glowColorInner = isSpeaking ? '#fb923c' : isListening ? '#67e8f9' : '#a78bfa';
    const statusLabel = isSpeaking ? 'SPEAKING' : isListening ? 'LISTENING' : 'STANDBY';

    return (
        <div
            className="relative flex items-center justify-center select-none"
            style={{ width: 340, height: 420, userSelect: 'none' }}
        >
            {/* ── Outermost ambient glow ───────────────────────────────── */}
            <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                    background: `radial-gradient(ellipse 60% 80% at 50% 50%, ${glowColorOuter}22 0%, transparent 70%)`,
                    transform: `scale(${ringScale})`,
                    transition: 'transform 0.1s ease-out, background 0.4s ease',
                    filter: `blur(18px)`,
                }}
            />

            {/* ── Rotating outer dashed ring ───────────────────────────── */}
            <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                    border: `1.5px dashed ${glowColorOuter}55`,
                    borderRadius: '50%',
                    width: '108%',
                    height: '108%',
                    top: '-4%',
                    left: '-4%',
                    animation: 'spin-slow 12s linear infinite',
                    opacity: glowIntensity + 0.3,
                    transition: 'opacity 0.4s ease, border-color 0.4s ease',
                }}
            />

            {/* ── Counter-rotating inner dashed ring ───────────────────── */}
            <div
                className="absolute pointer-events-none"
                style={{
                    border: `1px dashed ${glowColorInner}66`,
                    borderRadius: '50%',
                    width: '90%',
                    height: '90%',
                    top: '5%',
                    left: '5%',
                    animation: 'spin-reverse 8s linear infinite',
                    opacity: glowIntensity + 0.2,
                    transition: 'opacity 0.4s ease, border-color 0.4s ease',
                }}
            />

            {/* ── Solid glowing ring border ─────────────────────────────── */}
            <div
                className="absolute inset-0 rounded-[28px] pointer-events-none"
                style={{
                    boxShadow: `0 0 ${20 + amplitude * 60}px ${glowColorOuter}${Math.round(glowIntensity * 255).toString(16).padStart(2, '0')},
                                inset 0 0 ${10 + amplitude * 30}px ${glowColorInner}22`,
                    border: `1.5px solid ${glowColorOuter}${Math.round((glowIntensity * 0.8 + 0.1) * 255).toString(16).padStart(2, '0')}`,
                    borderRadius: 28,
                    transition: 'box-shadow 0.12s ease-out, border-color 0.4s ease',
                }}
            />

            {/* ── Robot Image ───────────────────────────────────────────── */}
            <div
                className="relative overflow-hidden"
                style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 24,
                    background: 'linear-gradient(160deg, #1e1b2e 0%, #0f172a 60%, #0a0f1e 100%)',
                }}
            >
                <img
                    src="/robot.png"
                    alt="AI Agent Avatar"
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: 'center top',
                        transform: `scale(${isSpeaking ? 1.01 + amplitude * 0.015 : 1})`,
                        transition: 'transform 0.12s ease-out',
                        filter: `brightness(${isSpeaking ? 1.05 + amplitude * 0.1 : isListening ? 1.02 : 0.95}) contrast(1.05)`,
                    }}
                />

                {/* Gradient overlay — keeps bottom fading into scene */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background:
                            'linear-gradient(to bottom, transparent 55%, rgba(10,15,30,0.75) 100%)',
                        borderRadius: 24,
                    }}
                />

                {/* Scan line — animated horizontal line sweeping down */}
                <div
                    className="absolute left-0 right-0 pointer-events-none"
                    style={{
                        height: 2,
                        background: `linear-gradient(to right, transparent, ${glowColorInner}88, transparent)`,
                        animation: 'scan-line 4s linear infinite',
                        opacity: isSpeaking || isListening ? 0.9 : 0.3,
                        transition: 'opacity 0.4s ease',
                    }}
                />

                {/* Top-left corner bracket */}
                <div
                    className="absolute top-3 left-3 pointer-events-none"
                    style={{
                        width: 20,
                        height: 20,
                        borderTop: `2px solid ${glowColorOuter}cc`,
                        borderLeft: `2px solid ${glowColorOuter}cc`,
                        transition: 'border-color 0.4s ease',
                    }}
                />
                {/* Top-right corner bracket */}
                <div
                    className="absolute top-3 right-3 pointer-events-none"
                    style={{
                        width: 20,
                        height: 20,
                        borderTop: `2px solid ${glowColorOuter}cc`,
                        borderRight: `2px solid ${glowColorOuter}cc`,
                        transition: 'border-color 0.4s ease',
                    }}
                />
                {/* Bottom-left corner bracket */}
                <div
                    className="absolute bottom-3 left-3 pointer-events-none"
                    style={{
                        width: 20,
                        height: 20,
                        borderBottom: `2px solid ${glowColorOuter}cc`,
                        borderLeft: `2px solid ${glowColorOuter}cc`,
                        transition: 'border-color 0.4s ease',
                    }}
                />
                {/* Bottom-right corner bracket */}
                <div
                    className="absolute bottom-3 right-3 pointer-events-none"
                    style={{
                        width: 20,
                        height: 20,
                        borderBottom: `2px solid ${glowColorOuter}cc`,
                        borderRight: `2px solid ${glowColorOuter}cc`,
                        transition: 'border-color 0.4s ease',
                    }}
                />

                {/* Status label */}
                <div
                    className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none"
                >
                    <span
                        style={{
                            fontSize: 10,
                            letterSpacing: '0.25em',
                            color: glowColorOuter,
                            textShadow: `0 0 8px ${glowColorOuter}`,
                            fontFamily: "'Outfit', sans-serif",
                            fontWeight: 600,
                            transition: 'color 0.4s ease',
                        }}
                    >
                        ◈ {statusLabel}
                    </span>
                </div>
            </div>

            {/* ── Audio amplitude bars (bottom) ─────────────────────────── */}
            {(isSpeaking || isListening) && (
                <div
                    className="absolute -bottom-6 left-0 right-0 flex justify-center items-end gap-0.5"
                    style={{ height: 24 }}
                >
                    {[...Array(18)].map((_, i) => {
                        const barAmp = isSpeaking
                            ? (amplitude + Math.sin(Date.now() / 200 + i * 0.6) * 0.15)
                            : 0.2 + Math.sin(Date.now() / 300 + i * 0.5) * 0.1;
                        const h = Math.max(4, barAmp * 22);
                        return (
                            <div
                                key={i}
                                style={{
                                    width: 3,
                                    height: h,
                                    borderRadius: 2,
                                    background: `linear-gradient(to top, ${glowColorOuter}, ${glowColorInner})`,
                                    opacity: 0.8,
                                    transition: 'height 0.06s ease',
                                }}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};
