/* ===================================================================
   VOICE AGENT — Gemini Live API Integration
   WebSocket · Web Audio API · PCM Streaming · Waveform Visualization
   =================================================================== */
(() => {
    "use strict";

    /* ── Configuration ── */
    const MODEL = "gemini-live-2.5-flash-native-audio";
    const INPUT_SAMPLE_RATE = 16000;
    const OUTPUT_SAMPLE_RATE = 24000;
    const BUFFER_SIZE = 4096;

    /* ── State ── */
    let ws = null;
    let audioCtx = (window.AudioContext || window.webkitAudioContext) ? new (window.AudioContext || window.webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE }) : null;
    let mediaStream = null;
    let scriptProcessor = null;
    let sourceNode = null;
    let isConnected = false;
    let isListening = false;
    let isSpeaking = false;
    let audioQueue = [];
    let isPlayingAudio = false;
    let currentPlaybackSource = null;
    let waveformAnimId = null;
    let analyserNode = null;
    let systemPrompt = "";

    /* ── DOM Elements ── */
    const el = {
        orb: document.getElementById("va-orb"),
        orbLabel: document.getElementById("va-orb-label"),
        waveformCanvas: document.getElementById("va-waveform"),
        statusDot: document.getElementById("va-status-dot"),
        statusText: document.getElementById("va-status-text"),
        micBtn: document.getElementById("va-mic-btn"),
        micIcon: document.getElementById("va-mic-icon"),
        endBtn: document.getElementById("va-end-btn"),
        clearBtn: document.getElementById("va-clear-btn"),
        transcript: document.getElementById("va-transcript"),
        transcriptEmpty: document.getElementById("va-transcript-empty"),
        chatInput: document.getElementById("va-chat-input"),
        btnSend: document.getElementById("va-btn-send"),
    };

    /* ── Initialize ── */
    async function init() {
        await loadSystemPrompt();
        setupEventListeners();
        setupWaveform();
        // Immediately try to prepare the backend token connection silently
        try {
            await fetch("/api/token");
        } catch (e) {
            console.log("Backend offline or auth missing.");
        }
    }

    /* ── Load Yousif's data as system prompt ── */
    async function loadSystemPrompt() {
        try {
            const resp = await fetch("data/content.json");
            const data = await resp.json();
            systemPrompt = buildSystemPrompt(data);
        } catch (e) {
            console.warn("Could not load content for system prompt:", e);
            systemPrompt = getDefaultSystemPrompt();
        }
    }

    function buildSystemPrompt(data) {
        const home = data.home || {};
        const about = data.about || {};
        const skills = data.skills || {};
        const qual = data.qualification || {};
        const services = data.services || {};
        const projects = data.projects || {};
        const contact = data.contact || {};

        // Build skills list
        const skillsList = (skills.groups || []).map(g =>
            `${g.title}: ${(g.items || []).map(i => i.name).join(", ")}`
        ).join("\n");

        // Build qualification list
        const eduEntries = (qual.entries?.education || []).map(e =>
            `${e.title} – ${e.subtitle} (${e.period})`
        ).join("\n");
        const workEntries = (qual.entries?.work || []).map(e =>
            `${e.title} at ${e.subtitle} (${e.period})`
        ).join("\n");

        // Build projects list
        const allProjects = [];
        for (const [category, items] of Object.entries(projects.groups || {})) {
            items.forEach(p => {
                allProjects.push(`[${category}] ${p.title}: ${p.description}`);
            });
        }

        // Build services
        const servicesList = (services.items || []).map(s =>
            `${s.title}: ${(s.features || []).join(", ")}`
        ).join("\n");

        return `You are Yousif Al-Nasser's personal AI voice assistant on his portfolio website. You represent Yousif and speak on his behalf in a friendly, professional, and enthusiastic manner. You should talk as if you ARE Yousif (first person). Be concise in voice responses — keep answers under 3 sentences when possible.

ABOUT YOUSIF:
Name: Yousif Al-Nasser
Title: ${home.subtitle || "Computer Engineer, Freelancer Developer"}
${about.description || ""}

EXPERIENCE STATS:
${(about.stats || []).map(s => `${s.value} ${s.label}`).join(", ")}

SKILLS:
${skillsList}

EDUCATION:
${eduEntries}

WORK EXPERIENCE:
${workEntries}

SERVICES OFFERED:
${servicesList}

PROJECTS:
${allProjects.join("\n")}

CONTACT:
${(contact.cards || []).map(c => `${c.title}: ${c.value}`).join("\n")}
${(contact.socialLinks || []).map(s => `${s.label}: ${s.url}`).join("\n")}

RULES:
1. Speak naturally and conversationally as Yousif
2. Be enthusiastic about AI and technology
3. When asked about projects, give brief but compelling descriptions
4. Direct people to the portfolio website for more details
5. You can discuss technical topics with depth
6. Be bilingual — respond in Arabic if the user speaks Arabic
7. Keep responses concise for voice (under 3 sentences usually)
8. Be warm and professional`;
    }

    function getDefaultSystemPrompt() {
        return `You are Yousif Al-Nasser's personal AI assistant. Yousif is a Computer Engineer and AI Engineer from Saudi Arabia with 8+ years of experience. He specializes in Machine Learning, Deep Learning, Web Development, and Electronics. Speak naturally, be enthusiastic about technology, and keep responses concise for voice.`;
    }

    /* ── Event Listeners ── */
    function setupEventListeners() {
        el.micBtn.addEventListener("click", handleMicClick);
        el.endBtn.addEventListener("click", () => disconnect());
        el.clearBtn.addEventListener("click", clearTranscript);
        el.btnSend.addEventListener("click", sendTextMessage);
        el.chatInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") sendTextMessage();
        });
    }

    /* ── Mic Button ── */
    async function handleMicClick() {
        // Must resume AudioContext strictly inside user gesture (before any awaits)
        if (audioCtx && audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        if (isConnected) {
            // Already connected — toggle mute/unmute
            if (isListening) {
                stopListening();
            } else {
                startListening();
            }
            return;
        }

        await connect();
    }

    /* ── WebSocket Connection ── */
    async function connect() {
        setStatus("connecting");

        try {
            // Fetch token and project details from local backend
            const authResp = await fetch("/api/token");
            if (!authResp.ok) {
                const errorData = await authResp.text();
                throw new Error("Backend authentication failed. Make sure server is running and Google Cloud auth is configured. Details: " + errorData);
            }
            const authData = await authResp.json();

            const accessToken = authData.token;
            const projectId = authData.projectId;
            const location = authData.location;


            // Get microphone
            mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: INPUT_SAMPLE_RATE,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            // Assemble Vertex AI Regionalized WebSocket URL
            const url = `wss://${location}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;

            // Connect to Google Cloud
            // In browsers, you cannot set Authorization headers on WebSockets easily,
            // so we pass the access token as a Bearer token or URL parameter if supported, but Vertex AI natively supports it in the URL when running from JS SDKs
            // Wait, Vertex AI requires Authorization Header, but browsers don't support custom headers in WebSocket() API!
            // Wait! If they don't support it, is an access_token query param valid? Yes, but sometimes it needs to be sent differently.
            // Oh, wait, the URL query param is usually allowed as a fallback: ?access_token=token or ?bearer_token=token.
            // I'll leave the url construction as:
            ws = new WebSocket(`${url}?access_token=${accessToken}`);

            ws.onopen = () => {
                // Determine the fully qualified Vertex AI Model Name
                const fullModelName = `projects/${projectId}/locations/${location}/publishers/google/models/${MODEL.split('/').pop()}`;

                // Send setup message
                const setup = {
                    setup: {
                        model: fullModelName,
                        generationConfig: {
                            responseModalities: ["AUDIO"],
                            speechConfig: {
                                voiceConfig: {
                                    prebuiltVoiceConfig: {
                                        voiceName: "Puck",
                                    },
                                },
                            },
                        },
                        systemInstruction: {
                            parts: [{ text: systemPrompt }],
                        },
                    },
                };
                ws.send(JSON.stringify(setup));
            };

            ws.onmessage = (event) => {
                handleServerMessage(event);
            };

            ws.onerror = (err) => {
                console.error("WebSocket error:", err);
                setStatus("error");
                addMessage("ai", "Connection error. Please check your API key and try again.");
                disconnect();
            };

            ws.onclose = (event) => {
                console.log("WebSocket closed:", event.code, event.reason);
                if (event.code >= 4000) {
                    addMessage("ai", `Connection closed by server (${event.code}). Token expired or failed.`);
                } else if (!isConnected) {
                    addMessage("ai", "Failed to connect to Vertex AI. Make sure Google Cloud auth is fully configured in the backend.");
                }
                disconnect();
            };
        } catch (err) {
            console.error("Connection failed:", err);
            if (err.name === "NotAllowedError") {
                addMessage("ai", "Microphone access denied. Please allow microphone access and try again.");
            } else {
                addMessage("ai", "Failed to connect. Please check your API key and try again.");
            }
            setStatus("offline");
            disconnect();
        }
    }

    /* ── Handle incoming server messages ── */
    async function handleServerMessage(event) {
        let data;

        if (event.data instanceof Blob) {
            const text = await event.data.text();
            try {
                data = JSON.parse(text);
            } catch {
                return;
            }
        } else {
            try {
                data = JSON.parse(event.data);
            } catch {
                return;
            }
        }

        // Setup complete
        if (data.setupComplete) {
            isConnected = true;
            setStatus("active");
            el.chatInput.disabled = false;
            el.btnSend.disabled = false;
            el.chatInput.placeholder = "Type a message to Yousif's AI...";
            startListening();
            addMessage("ai", "Hi! I'm Yousif's AI assistant. Feel free to ask me anything about my experience, projects, or skills!");
            return;
        }

        // Server content (audio/text responses)
        if (data.serverContent) {
            const parts = data.serverContent.modelTurn?.parts || [];

            for (const part of parts) {
                // Text response
                if (part.text) {
                    addMessage("ai", part.text);
                }

                // Audio response
                if (part.inlineData?.mimeType?.startsWith("audio/") && part.inlineData.data) {
                    const audioBytes = base64ToArrayBuffer(part.inlineData.data);
                    queueAudio(audioBytes);
                }
            }

            // Turn complete
            if (data.serverContent.turnComplete) {
                setSpeaking(false);
            }
        }
    }

    /* ── Audio Input (Microphone → PCM → WebSocket) ── */
    function startListening() {
        if (!mediaStream || !ws || ws.readyState !== WebSocket.OPEN) return;

        isListening = true;
        el.micBtn.classList.add("active");
        el.micIcon.className = "uil uil-microphone-slash";
        setStatus("listening");

        // Create audio pipeline
        const inputCtx = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: INPUT_SAMPLE_RATE,
        });

        sourceNode = inputCtx.createMediaStreamSource(mediaStream);
        analyserNode = inputCtx.createAnalyser();
        analyserNode.fftSize = 256;
        sourceNode.connect(analyserNode);

        scriptProcessor = inputCtx.createScriptProcessor(BUFFER_SIZE, 1, 1);
        analyserNode.connect(scriptProcessor);
        scriptProcessor.connect(inputCtx.destination);

        scriptProcessor.onaudioprocess = (e) => {
            if (!isListening || !ws || ws.readyState !== WebSocket.OPEN) return;

            const inputData = e.inputBuffer.getChannelData(0);
            const pcm16 = float32ToPcm16(inputData);
            const b64 = arrayBufferToBase64(pcm16.buffer);

            const msg = {
                realtimeInput: {
                    mediaChunks: [{
                        mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
                        data: b64,
                    }],
                },
            };

            try {
                ws.send(JSON.stringify(msg));
            } catch (err) {
                console.warn("Failed to send audio:", err);
            }
        };

        startWaveformAnimation();
    }

    function stopListening() {
        isListening = false;
        el.micBtn.classList.remove("active");
        el.micIcon.className = "uil uil-microphone";
        setStatus("active");

        if (scriptProcessor) {
            scriptProcessor.disconnect();
            scriptProcessor = null;
        }
        if (sourceNode) {
            sourceNode.disconnect();
            sourceNode = null;
        }
        if (analyserNode) {
            analyserNode.disconnect();
            analyserNode = null;
        }
    }

    /* ── Audio Output (PCM → Playback) ── */
    function queueAudio(pcmBuffer) {
        audioQueue.push(pcmBuffer);
        setSpeaking(true);
        if (!isPlayingAudio) {
            playNextAudio();
        }
    }

    function playNextAudio() {
        if (audioQueue.length === 0) {
            isPlayingAudio = false;
            setSpeaking(false);
            return;
        }

        isPlayingAudio = true;
        const pcmBuffer = audioQueue.shift();
        const samples = new Int16Array(pcmBuffer);
        const floatSamples = new Float32Array(samples.length);

        for (let i = 0; i < samples.length; i++) {
            floatSamples[i] = samples[i] / 32768;
        }

        const audioBuffer = audioCtx.createBuffer(1, floatSamples.length, OUTPUT_SAMPLE_RATE);
        audioBuffer.getChannelData(0).set(floatSamples);

        currentPlaybackSource = audioCtx.createBufferSource();
        currentPlaybackSource.buffer = audioBuffer;
        currentPlaybackSource.connect(audioCtx.destination);

        currentPlaybackSource.onended = () => {
            currentPlaybackSource = null;
            playNextAudio();
        };

        currentPlaybackSource.start();
    }

    /* ── Text Chat ── */
    function sendTextMessage() {
        if (!ws || ws.readyState !== WebSocket.OPEN || !isConnected) return;
        const text = el.chatInput.value.trim();
        if (!text) return;

        // Clear input
        el.chatInput.value = "";

        // Add to transcript immediately
        addMessage("user", text);

        // Construct Vertex AI Multimodal Live API clientContent message
        const msg = {
            clientContent: {
                turns: [{
                    role: "user",
                    parts: [{ text: text }]
                }],
                turnComplete: true
            }
        };

        try {
            ws.send(JSON.stringify(msg));
        } catch (err) {
            console.error("Failed to send text message:", err);
        }
    }

    /* ── Disconnect ── */
    function disconnect() {
        stopListening();

        if (currentPlaybackSource) {
            try { currentPlaybackSource.stop(); } catch { }
            currentPlaybackSource = null;
        }
        audioQueue = [];
        isPlayingAudio = false;

        if (ws) {
            try { ws.close(); } catch { }
            ws = null;
        }

        if (mediaStream) {
            mediaStream.getTracks().forEach(t => t.stop());
            mediaStream = null;
        }

        if (audioCtx) {
            try { audioCtx.close(); } catch { }
            audioCtx = null;
        }

        isConnected = false;
        isSpeaking = false;
        el.endBtn.style.display = "none";

        el.chatInput.disabled = true;
        el.btnSend.disabled = true;
        el.chatInput.placeholder = "Type a message (Connect first)...";

        setStatus("offline");
        stopWaveformAnimation();
    }

    /* ── Status Management ── */
    function setStatus(status) {
        el.statusDot.className = "va-status-dot";
        el.orb.className = "va-orb";

        switch (status) {
            case "connecting":
                el.statusText.textContent = "Connecting...";
                el.orb.classList.add("va-orb--connecting");
                el.orbLabel.textContent = "Connecting to Gemini...";
                break;
            case "active":
                el.statusDot.classList.add("va-status-dot--active");
                el.statusText.textContent = "Connected";
                el.orbLabel.textContent = "Press mic to talk";
                el.endBtn.style.display = "flex";
                break;
            case "listening":
                el.statusDot.classList.add("va-status-dot--listening");
                el.statusText.textContent = "Listening...";
                el.orb.classList.add("va-orb--listening");
                el.orbLabel.textContent = "Listening...";
                el.endBtn.style.display = "flex";
                break;
            case "speaking":
                el.statusDot.classList.add("va-status-dot--speaking");
                el.statusText.textContent = "Speaking...";
                el.orb.classList.add("va-orb--speaking");
                el.orbLabel.textContent = "Speaking...";
                break;
            case "error":
                el.statusText.textContent = "Error";
                el.orbLabel.textContent = "Connection failed";
                break;
            default:
                el.statusText.textContent = "Offline";
                el.orbLabel.textContent = "Press the microphone to start";
                el.endBtn.style.display = "none";
        }
    }

    function setSpeaking(val) {
        isSpeaking = val;
        if (val) {
            setStatus("speaking");
        } else if (isListening) {
            setStatus("listening");
        } else if (isConnected) {
            setStatus("active");
        }
    }

    /* ── Transcript ── */
    function addMessage(role, text) {
        el.transcriptEmpty.style.display = "none";

        const msg = document.createElement("div");
        msg.className = "va-msg";

        const avatar = document.createElement("div");
        avatar.className = `va-msg__avatar va-msg__avatar--${role}`;
        avatar.textContent = role === "ai" ? "Y" : "U";

        const textEl = document.createElement("div");
        textEl.className = "va-msg__text";
        textEl.textContent = text;

        msg.appendChild(avatar);
        msg.appendChild(textEl);
        el.transcript.appendChild(msg);

        // Auto-scroll
        el.transcript.scrollTop = el.transcript.scrollHeight;
    }

    function clearTranscript() {
        el.transcript.innerHTML = "";
        el.transcriptEmpty.style.display = "block";
        el.transcript.appendChild(el.transcriptEmpty);
    }

    /* ── Waveform Visualization ── */
    function setupWaveform() {
        const canvas = el.waveformCanvas;
        const container = canvas.parentElement;
        canvas.width = container.offsetWidth || 240;
        canvas.height = container.offsetHeight || 240;

        window.addEventListener("resize", () => {
            canvas.width = container.offsetWidth || 240;
            canvas.height = container.offsetHeight || 240;
        });
    }

    function startWaveformAnimation() {
        const canvas = el.waveformCanvas;
        const ctx = canvas.getContext("2d");

        function draw() {
            waveformAnimId = requestAnimationFrame(draw);

            const w = canvas.width;
            const h = canvas.height;
            const cx = w / 2;
            const cy = h / 2;
            const r = Math.min(cx, cy) * 0.6;

            ctx.clearRect(0, 0, w, h);

            if (!analyserNode) {
                // Draw idle circle
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.strokeStyle = "rgba(0, 212, 255, 0.1)";
                ctx.lineWidth = 2;
                ctx.stroke();
                return;
            }

            const bufferLength = analyserNode.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyserNode.getByteFrequencyData(dataArray);

            // Average amplitude
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
            const avg = sum / bufferLength / 255;

            // Draw dynamic circle with amplitude
            const points = 64;
            ctx.beginPath();

            for (let i = 0; i <= points; i++) {
                const angle = (i / points) * Math.PI * 2;
                const freqIndex = Math.floor((i / points) * bufferLength);
                const amp = dataArray[freqIndex] / 255;
                const offset = amp * 15 * (isSpeaking ? 1.5 : 1);
                const currentR = r + offset;

                const x = cx + Math.cos(angle) * currentR;
                const y = cy + Math.sin(angle) * currentR;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }

            ctx.closePath();

            const gradient = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r + 20);
            if (isSpeaking) {
                gradient.addColorStop(0, "rgba(124, 58, 237, 0.05)");
                gradient.addColorStop(1, "rgba(124, 58, 237, 0.15)");
                ctx.strokeStyle = `rgba(124, 58, 237, ${0.3 + avg * 0.5})`;
            } else {
                gradient.addColorStop(0, "rgba(0, 212, 255, 0.05)");
                gradient.addColorStop(1, "rgba(0, 212, 255, 0.15)");
                ctx.strokeStyle = `rgba(0, 212, 255, ${0.3 + avg * 0.5})`;
            }

            ctx.fillStyle = gradient;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        draw();
    }

    function stopWaveformAnimation() {
        if (waveformAnimId) {
            cancelAnimationFrame(waveformAnimId);
            waveformAnimId = null;
        }

        // Clear canvas
        const canvas = el.waveformCanvas;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    /* ── Utility Functions ── */
    function float32ToPcm16(float32) {
        const pcm16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
            const s = Math.max(-1, Math.min(1, float32[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return pcm16;
    }

    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }

    function base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /* ── Start ── */
    document.addEventListener("DOMContentLoaded", init);
})();
