import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Activity } from 'lucide-react';
import { useVoiceAgent } from '../../hooks/useVoiceAgent';
import { RobotAvatar } from './RobotAvatar';
import { motion, AnimatePresence } from 'framer-motion';

export const Interface = () => {
    const { isConnected, isListening, startListening, stopListening, messages, sourceAnalyser } = useVoiceAgent();
    const chatEndRef = useRef(null);
    const isSpeaking = messages.length > 0 && messages[messages.length - 1].role === 'ai';

    // Auto-scroll to bottom of chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="relative w-full h-screen bg-[#0a0f1e] overflow-hidden font-['Outfit']">

            {/* ── Ambient background grid ─────────────────────────── */}
            <div
                className="absolute inset-0 z-0 pointer-events-none"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(139,92,246,0.04) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(139,92,246,0.04) 1px, transparent 1px)
                    `,
                    backgroundSize: '48px 48px',
                }}
            />
            {/* Radial vignette */}
            <div
                className="absolute inset-0 z-0 pointer-events-none"
                style={{
                    background: 'radial-gradient(ellipse 80% 80% at 50% 40%, transparent 20%, rgba(10,15,30,0.85) 100%)',
                }}
            />

            {/* ── UI ───────────────────────────────────────────────── */}
            <div className="absolute inset-0 z-10 flex flex-col h-full">

                {/* Header HUD */}
                <div className="flex justify-between items-start p-6 md:px-12 md:pt-8 flex-shrink-0">
                    <div className="flex flex-col">
                        <h1 className="text-3xl font-bold tracking-wider text-white uppercase drop-shadow-[0_0_10px_rgba(139,92,246,0.5)]">
                            Yousif<span className="text-cyan-400">.AI</span>
                        </h1>
                        <span className="text-xs text-white/50 tracking-[0.2em] uppercase mt-1">
                            Voice Agent v2.0
                        </span>
                    </div>

                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full border backdrop-blur-md transition-colors duration-500 ${isConnected
                            ? 'bg-green-500/10 border-green-500/20 text-green-400'
                            : 'bg-red-500/10 border-red-500/20 text-red-400'
                        }`}>
                        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                        <span className="text-xs font-semibold uppercase tracking-wider">
                            {isConnected ? 'System Online' : 'Connecting...'}
                        </span>
                    </div>
                </div>

                {/* ── Centre: Avatar ─────────────────────────────────── */}
                <div className="flex-1 flex items-center justify-center relative">

                    {/* Top floating data strip */}
                    <div
                        className="absolute top-0 left-1/2 -translate-x-1/2 flex gap-6 text-[10px] uppercase tracking-widest text-white/30"
                        style={{ fontFamily: "'Outfit', monospace" }}
                    >
                        {['Deepgram STT', 'Groq LLM', 'Deepgram TTS'].map((label) => (
                            <span key={label} className="flex items-center gap-1">
                                <span
                                    className="inline-block w-1.5 h-1.5 rounded-full"
                                    style={{ background: isConnected ? '#22d3ee' : '#64748b' }}
                                />
                                {label}
                            </span>
                        ))}
                    </div>

                    <RobotAvatar
                        isSpeaking={isSpeaking}
                        isListening={isListening}
                        analyser={sourceAnalyser.current}
                    />
                </div>

                {/* ── Bottom HUD ─────────────────────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end p-6 md:px-12 md:pb-8 flex-shrink-0">

                    {/* Chat Log */}
                    <div className="pointer-events-auto w-full h-[260px] overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md flex flex-col">
                        <div className="p-3 border-b border-white/5 bg-white/5 flex-shrink-0">
                            <h3 className="text-xs font-semibold text-white/70 uppercase tracking-widest flex items-center gap-2">
                                <Activity size={12} /> Communication Log
                            </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                            <AnimatePresence>
                                {messages.map((msg, idx) => (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                                    >
                                        <div className={`max-w-[90%] p-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                                                ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-50 rounded-tr-sm'
                                                : 'bg-violet-600/10 border border-violet-500/20 text-violet-50 rounded-tl-sm'
                                            }`}>
                                            {msg.content}
                                        </div>
                                        <span className="text-[10px] text-white/30 mt-1 uppercase tracking-wider">
                                            {msg.role}
                                        </span>
                                    </motion.div>
                                ))}
                                <div ref={chatEndRef} />
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Mic Button */}
                    <div className="pointer-events-auto flex flex-col items-center justify-end pb-4 gap-4">

                        {/* Outer pulse ring when listening */}
                        <div className="relative">
                            {isListening && (
                                <div
                                    className="absolute inset-0 rounded-full animate-ping"
                                    style={{
                                        background: 'rgba(34, 211, 238, 0.15)',
                                        transform: 'scale(1.5)',
                                    }}
                                />
                            )}
                            <button
                                onClick={isListening ? stopListening : startListening}
                                className={`group relative flex items-center justify-center w-20 h-20 rounded-full transition-all duration-300 border border-white/10 backdrop-blur-sm ${isListening
                                        ? 'bg-red-500/20 shadow-[0_0_40px_rgba(239,68,68,0.5)]'
                                        : 'bg-cyan-500/10 hover:bg-cyan-500/20 shadow-[0_0_30px_rgba(34,211,238,0.25)]'
                                    }`}
                            >
                                <div className={`absolute inset-1 rounded-full border border-white/20 ${isListening ? 'animate-ping opacity-20' : ''}`} />
                                {isListening
                                    ? <MicOff size={28} className="text-red-400 group-hover:scale-110 transition-transform" />
                                    : <Mic size={28} className="text-cyan-400 group-hover:scale-110 transition-transform" />
                                }
                            </button>
                        </div>

                        <p className="text-xs text-white/40 uppercase tracking-widest font-medium">
                            {isListening ? 'Listening...' : 'Tap to Speak'}
                        </p>
                    </div>

                    {/* Right: Frequency bars */}
                    <div className="hidden md:flex flex-col items-end justify-end space-y-2">
                        <div className="w-full flex justify-end items-end gap-1" style={{ height: 40 }}>
                            {[...Array(8)].map((_, i) => (
                                <div
                                    key={i}
                                    style={{
                                        width: 4,
                                        borderRadius: 2,
                                        background: isSpeaking
                                            ? 'linear-gradient(to top, #f97316, #fb923c)'
                                            : isListening
                                                ? 'linear-gradient(to top, #22d3ee, #67e8f9)'
                                                : 'rgba(255,255,255,0.15)',
                                        height: isSpeaking || isListening
                                            ? `${14 + Math.sin(Date.now() / 200 + i * 0.7) * 10}px`
                                            : '8px',
                                        animation: 'pulse 1.2s ease-in-out infinite',
                                        animationDelay: `${i * 0.12}s`,
                                    }}
                                />
                            ))}
                        </div>
                        <span className="text-[10px] text-white/30 uppercase tracking-widest">Signal Node</span>
                    </div>

                </div>
            </div>
        </div>
    );
};
