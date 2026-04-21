/* ===================================================================
   VOICE AGENT — Gemini Live API Integration
   WebSocket · Web Audio API · PCM Streaming · Waveform Visualization
   =================================================================== */
(() => {
    "use strict";

    /* ── Configuration ── */
    const INPUT_SAMPLE_RATE = 16000;
    const OUTPUT_SAMPLE_RATE = 24000;

    /* ── State ── */
    let ws = null;
    let audioCtx = (window.AudioContext || window.webkitAudioContext) ? new (window.AudioContext || window.webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE }) : null;
    let mediaStream = null;
    let inputCtx = null;
    let workletNode = null;
    let sourceNode = null;
    let isConnected = false;
    let heartbeatTimer = null;
    let isListening = false;
    let isSpeaking = false;
    let isMuted = false;
    let audioQueue = [];
    let isPlayingAudio = false;
    let currentPlaybackSource = null;
    let waveformAnimId = null;
    let analyserNode = null;
    let systemPrompt = "";
    let activeAiMessageEl = null;
    let turnResetTimer = null;

    /* ── DOM Elements ── */
    const el = {
        orb: document.getElementById("va-orb"),
        orbLabel: document.getElementById("va-orb-label"),
        waveformCanvas: document.getElementById("va-waveform"),
        statusDot: document.getElementById("va-status-dot"),
        statusText: document.getElementById("va-status-text"),
        micBtn: document.getElementById("va-mic-btn"),
        micIcon: document.getElementById("va-mic-icon"),
        connectBtn: document.getElementById("va-connect-btn"),
        connectIcon: document.getElementById("va-connect-icon"),
        connectLabel: document.getElementById("va-connect-label"),
        clearBtn: document.getElementById("va-clear-btn"),
        muteBtn: document.getElementById("va-mute-btn"),
        muteIcon: document.getElementById("va-mute-icon"),
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
        showWelcome();
    }

    function showWelcome() {
        el.transcriptEmpty.style.display = "none";
        const msg = document.createElement("div");
        msg.className = "va-msg va-msg--welcome";

        const avatar = document.createElement("div");
        avatar.className = "va-msg__avatar va-msg__avatar--ai";
        avatar.textContent = "Y";

        const body = document.createElement("div");
        body.className = "va-msg__text";
        body.innerHTML = `
            <strong style="color:var(--text-primary)">👋 Welcome! I'm Yousif's AI Assistant</strong><br>
            I can answer anything about Yousif — his experience, projects, skills, and more.
            <br><br><span style="color:var(--accent-cyan);font-weight:600;">To get started:</span>
            <div class="va-msg__step"><span class="va-msg__step-num">1</span> Click <strong style="color:var(--text-primary)">Connect</strong> to establish a session</div>
            <div class="va-msg__step"><span class="va-msg__step-num">2</span> Press the <strong style="color:var(--text-primary)">🎤 Mic</strong> button to speak</div>
            <div class="va-msg__step"><span class="va-msg__step-num">3</span> Or type your message in the box below</div>
        `;

        msg.appendChild(avatar);
        msg.appendChild(body);
        el.transcript.appendChild(msg);
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

`;
    }

    function getDefaultSystemPrompt() {
        return `You are Yousif Al-Nasser's personal AI assistant. Yousif is a Computer Engineer and AI Engineer from Saudi Arabia with 8+ years of experience. He specializes in Machine Learning, Deep Learning, Web Development, and Electronics. Speak naturally, be enthusiastic about technology, and keep responses concise for voice.`;
    }

    /* ── Event Listeners ── */
    function setupEventListeners() {
        el.micBtn.addEventListener("click", handleMicClick);
        el.connectBtn.addEventListener("click", () => isConnected ? disconnect() : connect());
        el.clearBtn.addEventListener("click", clearTranscript);
        el.muteBtn.addEventListener("click", toggleMute);
        el.btnSend.addEventListener("click", sendTextMessage);
        el.chatInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") sendTextMessage();
        });
    }

    function toggleMute() {
        isMuted = !isMuted;
        el.muteIcon.className = isMuted ? "uil uil-volume-mute" : "uil uil-volume";
        el.muteBtn.title = isMuted ? "Unmute AI voice" : "Mute AI voice";
        el.muteBtn.classList.toggle("muted", isMuted);
        if (isMuted && currentPlaybackSource) {
            try { currentPlaybackSource.stop(); } catch {}
            currentPlaybackSource = null;
            audioQueue = [];
            isPlayingAudio = false;
            setSpeaking(false);
        }
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
                await startListening();
            }
            return;
        }

        await connect();
    }

    /* ── WebSocket Connection ── */
    async function connect() {
        setStatus("connecting");

        // Recreate AudioContext if it was closed during a previous disconnect
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
        }

        try {
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

            const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
            ws = new WebSocket(`${proto}//${window.location.host}/ws`);

            ws.onopen = () => {
                console.log("Connected to backend proxy. Sending setup...");
                ws.send(JSON.stringify({
                    setup: {
                        session_type: "voice",
                        system_instruction: systemPrompt
                    }
                }));
            };

            ws.onmessage = (event) => {
                handleServerMessage(event);
            };

            ws.onerror = (err) => {
                console.error("WebSocket error:", err);
                setStatus("error");
                addMessage("ai", "Connection error. Please check your API key and try again.");
            };

            ws.onclose = (event) => {
                console.log("WebSocket closed:", event.code, event.reason);
                // Only show error if we never successfully connected
                if (!isConnected) {
                    addMessage("ai", "⚠️ Could not connect. Make sure the server is running, then click Connect.");
                }
                disconnect();
            };
        } catch (err) {
            console.error("Connection failed:", err);
            if (err.name === "NotAllowedError") {
                addMessage("ai", "Microphone access denied. Please allow microphone access and try again.");
            } else {
                addMessage("ai", "Failed to connect. Please make sure the backend server (FastAPI) is running.");
            }
            setStatus("offline");
            disconnect();
        }
    }

    /* ── Handle incoming server messages (via Proxy) ── */
    async function handleServerMessage(event) {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch {
            return;
        }

        // 1. Wait for ready signal from proxy
        if (data.status === "ready" && !isConnected) {
            isConnected = true;
            setStatus("active");
            el.connectIcon.className = "uil uil-times";
            el.connectLabel.textContent = "Disconnect";
            el.connectBtn.classList.add("connected");
            el.chatInput.disabled = false;
            el.btnSend.disabled = false;
            el.chatInput.placeholder = "Type a message to Yousif's AI...";
            heartbeatTimer = setInterval(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ ping: true }));
                }
            }, 20000);
            await startListening();
            return;
        }

        // 2. Handle transcripts
        if (data.transcript) {
            if (data.type === "model") {
                // Clear idle-reset timer while chunks are still arriving
                clearTimeout(turnResetTimer);

                if (!activeAiMessageEl) {
                    activeAiMessageEl = addMessage("ai", data.transcript);
                } else {
                    const prev = activeAiMessageEl.lastChild;
                    if (prev && prev.nodeType === Node.TEXT_NODE) {
                        const prevText = prev.textContent;
                        if (prevText && !/\s$/.test(prevText) && !/^\s/.test(data.transcript)) {
                            prev.textContent += " ";
                        }
                    }
                    renderTextWithLinks(activeAiMessageEl, data.transcript);
                    el.transcript.scrollTop = el.transcript.scrollHeight;
                }
                setSpeaking(true);

                // After 800ms of silence, treat turn as done → next reply = new bubble
                turnResetTimer = setTimeout(() => { activeAiMessageEl = null; }, 800);
            } else {
                clearTimeout(turnResetTimer);
                activeAiMessageEl = null;
                addMessage("user", data.transcript);
            }
            return;
        }

        if (data.turn_complete) {
            clearTimeout(turnResetTimer);
            activeAiMessageEl = null;
            return;
        }

        // 3. Handle audio responses
        if (data.audio) {
            if (!isMuted) queueAudio(base64ToArrayBuffer(data.audio));
            return;
        }

        // 4. Handle errors from proxy
        if (data.error) {
            console.error("Proxy error:", data.error);
            addErrorMessage(data.error);
            return;
        }
    }

    /* ── Audio Input (Microphone → PCM → WebSocket) ── */
    async function startListening() {
        if (!mediaStream || !ws || ws.readyState !== WebSocket.OPEN) return;

        try {
            // Create audio pipeline
            inputCtx = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: INPUT_SAMPLE_RATE,
            });

            await inputCtx.audioWorklet.addModule("/js/audio-processor.js");

            sourceNode = inputCtx.createMediaStreamSource(mediaStream);
            analyserNode = inputCtx.createAnalyser();
            analyserNode.fftSize = 256;
            sourceNode.connect(analyserNode);

            workletNode = new AudioWorkletNode(inputCtx, "pcm-audio-processor");
            analyserNode.connect(workletNode);
            workletNode.connect(inputCtx.destination);

            workletNode.port.onmessage = (e) => {
                if (!isListening || !ws || ws.readyState !== WebSocket.OPEN) return;
                const pcm16 = float32ToPcm16(e.data);
                const b64 = arrayBufferToBase64(pcm16.buffer);
                try {
                    ws.send(JSON.stringify({ audio: b64 }));
                } catch (err) {
                    console.warn("Failed to send audio:", err);
                }
            };

            // Only set state after pipeline is ready
            isListening = true;
            el.micBtn.classList.add("active");
            el.micIcon.className = "uil uil-microphone-slash";
            setStatus("listening");
            startWaveformAnimation();
        } catch (err) {
            console.error("Failed to start listening:", err);
            stopListening(true);
        }
    }

    function stopListening(silent = false) {
        isListening = false;
        el.micBtn.classList.remove("active");
        el.micIcon.className = "uil uil-microphone";
        if (!silent) setStatus("active");

        if (workletNode) {
            workletNode.disconnect();
            workletNode = null;
        }
        if (sourceNode) {
            sourceNode.disconnect();
            sourceNode = null;
        }
        if (analyserNode) {
            analyserNode.disconnect();
            analyserNode = null;
        }
        if (inputCtx) {
            try { inputCtx.close(); } catch { }
            inputCtx = null;
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

        if (!audioCtx) {
            isPlayingAudio = false;
            audioQueue = [];
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

        el.chatInput.value = "";
        activeAiMessageEl = null;   // reset so next AI reply gets a fresh bubble
        addMessage("user", text);

        // Simplified message for the proxy
        const msg = {
            text: text
        };

        try {
            ws.send(JSON.stringify(msg));
        } catch (err) {
            console.error("Failed to send text message:", err);
        }
    }

    /* ── Disconnect ── */
    function disconnect() {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }

        // Null ws before closing so the onclose handler doesn't re-enter disconnect
        const _ws = ws;
        ws = null;
        if (_ws) {
            try { _ws.close(); } catch { }
        }

        stopListening(true);

        if (currentPlaybackSource) {
            try { currentPlaybackSource.stop(); } catch { }
            currentPlaybackSource = null;
        }
        audioQueue = [];
        isPlayingAudio = false;

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
        activeAiMessageEl = null;

        el.connectIcon.className = "uil uil-link";
        el.connectLabel.textContent = "Connect";
        el.connectBtn.classList.remove("connected");

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

                break;
            case "listening":
                el.statusDot.classList.add("va-status-dot--listening");
                el.statusText.textContent = "Listening...";
                el.orb.classList.add("va-orb--listening");
                el.orbLabel.textContent = "Listening...";

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

        }
    }

    function setSpeaking(val) {
        isSpeaking = val;
        if (val) {
            setStatus("speaking");
        } else if (isListening) {
            // Resume inputCtx if the browser suspended it during playback
            if (inputCtx && inputCtx.state === "suspended") {
                inputCtx.resume().catch(() => {});
            }
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
        renderTextWithLinks(textEl, text);

        msg.appendChild(avatar);
        msg.appendChild(textEl);
        el.transcript.appendChild(msg);

        el.transcript.scrollTop = el.transcript.scrollHeight;
        return textEl;
    }

    function addErrorMessage(text) {
        const div = document.createElement("div");
        div.style.cssText = "display:flex;align-items:flex-start;gap:0.65rem;margin-bottom:0.75rem;animation:msgIn 0.3s var(--ease);";

        const icon = document.createElement("div");
        icon.style.cssText = "width:26px;height:26px;border-radius:50%;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.35);color:#ef4444;display:flex;align-items:center;justify-content:center;font-size:0.75rem;flex-shrink:0;margin-top:2px;";
        icon.textContent = "!";

        const bubble = document.createElement("div");
        bubble.style.cssText = "font-size:0.82rem;line-height:1.5;color:#f87171;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:0.6rem;padding:0.5rem 0.75rem;max-width:90%;";
        bubble.textContent = text;

        div.appendChild(icon);
        div.appendChild(bubble);
        el.transcript.appendChild(div);
        el.transcript.scrollTop = el.transcript.scrollHeight;
    }

    function isSafeUrl(url) {
        try {
            const parsed = new URL(url);
            return parsed.protocol === "https:" || parsed.protocol === "http:";
        } catch {
            return false;
        }
    }

    function renderTextWithLinks(el, text) {
        const urlPattern = /(https?:\/\/[^\s]+)/g;
        const parts = text.split(urlPattern);
        parts.forEach(part => {
            if (urlPattern.test(part) && isSafeUrl(part)) {
                const a = document.createElement("a");
                a.href = part;
                a.textContent = part;
                a.target = "_blank";
                a.rel = "noopener noreferrer";
                a.style.cssText = "color: var(--accent-cyan); text-decoration: underline; word-break: break-all;";
                el.appendChild(a);
            } else if (part) {
                el.appendChild(document.createTextNode(part));
            }
        });
        urlPattern.lastIndex = 0;
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
