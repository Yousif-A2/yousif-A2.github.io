import { useState, useEffect, useRef } from 'react';

export const useVoiceAgent = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [messages, setMessages] = useState([]);
    const ws = useRef(null);
    const mediaRecorder = useRef(null);
    const audioQueue = useRef([]);
    const isPlaying = useRef(false);
    const sourceAnalyser = useRef(null);
    const inputAnalyser = useRef(null);
    const audioContext = useRef(null);

    useEffect(() => {
        // Initialize AudioContext
        audioContext.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });

        // Create Analyser for AI Voice (Output)
        sourceAnalyser.current = audioContext.current.createAnalyser();
        sourceAnalyser.current.fftSize = 256;

        // Create Analyser for User Voice (Input)
        inputAnalyser.current = audioContext.current.createAnalyser();
        inputAnalyser.current.fftSize = 256;

        const connectWebSocket = () => {
            // Use relative URL for easier deployment if served from same origin, or env var
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // When running via Vite proxy or separate server, assume port 3000 locally
            const host = window.location.hostname === 'localhost' ? '127.0.0.1:3001' : window.location.host;
            ws.current = new WebSocket(`${protocol}//${host}`);

            ws.current.onopen = () => {
                console.log('Connected to server');
                setIsConnected(true);
            };

            ws.current.onmessage = async (event) => {
                if (typeof event.data === 'string') {
                    const data = JSON.parse(event.data);
                    if (data.type === 'text' || data.type === 'transcription') {
                        setMessages((prev) => [...prev, { role: data.role, content: data.content }]);
                    }
                } else if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
                    // Audio data received
                    const arrayBuffer = event.data instanceof Blob ? await event.data.arrayBuffer() : event.data;
                    audioQueue.current.push(arrayBuffer);
                    playNextAudio();
                }
            };

            ws.current.onclose = () => {
                setIsConnected(false);
                // Reconnect logic could go here
            };
        };

        connectWebSocket();

        return () => {
            ws.current?.close();
            audioContext.current?.close();
        };
    }, []);

    const playNextAudio = async () => {
        if (isPlaying.current || audioQueue.current.length === 0) return;

        isPlaying.current = true;
        const audioData = audioQueue.current.shift();

        try {
            const audioBuffer = await audioContext.current.decodeAudioData(audioData);
            const source = audioContext.current.createBufferSource();
            source.buffer = audioBuffer;

            // Connect to Analyser (Visualizer) -> Destination (Speakers)
            source.connect(sourceAnalyser.current);
            sourceAnalyser.current.connect(audioContext.current.destination);

            source.start(0);

            source.onended = () => {
                isPlaying.current = false;
                playNextAudio();
            };
        } catch (err) {
            console.error("Error decoding audio:", err);
            isPlaying.current = false;
            playNextAudio();
        }
    };

    const startListening = async () => {
        try {
            // Resume AudioContext if suspended (browser policy)
            if (audioContext.current?.state === 'suspended') {
                await audioContext.current.resume();
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Signal server to start Deepgram connection
            if (ws.current?.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({ type: 'start_listening' }));
            }

            // Connect Microphone -> Analyser
            const source = audioContext.current.createMediaStreamSource(stream);
            source.connect(inputAnalyser.current);

            mediaRecorder.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });

            mediaRecorder.current.ondataavailable = (event) => {
                if (event.data.size > 0 && ws.current?.readyState === WebSocket.OPEN) {
                    ws.current.send(event.data);
                }
            };

            mediaRecorder.current.start(250); // Send chunks every 250ms
            setIsListening(true);
        } catch (err) {
            console.error('Error accessing microphone:', err);
        }
    };

    const stopListening = () => {
        if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
            mediaRecorder.current.stop();
            mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
            setIsListening(false);
        }
        // Signal server to close Deepgram connection
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'stop_listening' }));
        }
    };

    return {
        isConnected,
        isListening,
        startListening,
        stopListening,
        messages,
        sourceAnalyser, // Expose for AI voice visualization
        inputAnalyser   // Expose for User voice visualization
    };
};
