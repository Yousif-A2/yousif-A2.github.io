/* ===================================================================
   CHAT PAGE — Gemini Live Chat + Voice Recorder
   WebSocket proxy · MediaRecorder · PCM streaming · Link rendering
   =================================================================== */
(() => {
    "use strict";

    /* ── Config ── */
    const INPUT_SAMPLE_RATE  = 16000;
    const OUTPUT_SAMPLE_RATE = 24000;

    /* ── State ── */
    let ws              = null;
    let isConnected     = false;
    let isRecording     = false;
    let isThinking      = false;
    let heartbeatTimer  = null;
    let mediaStream     = null;
    let inputCtx        = null;
    let workletNode     = null;
    let sourceNode      = null;
    let audioCtx        = null;
    let audioQueue      = [];
    let isPlayingAudio  = false;
    let currentSource   = null;
    let activeAiBubble  = null;
    let systemPrompt    = "";

    /* ── DOM ── */
    const el = {
        messages:    document.getElementById("chat-messages"),
        emptyState:  document.getElementById("chat-empty"),
        statusDot:   document.getElementById("chat-status-dot"),
        statusText:  document.getElementById("chat-status-text"),
        connectBtn:  document.getElementById("chat-connect-btn"),
        recordBtn:   document.getElementById("chat-record-btn"),
        sendBtn:     document.getElementById("chat-send-btn"),
        input:       document.getElementById("chat-input"),
        hint:        document.getElementById("chat-hint"),
    };

    /* ── Init ── */
    async function init() {
        await loadSystemPrompt();
        setupEvents();
    }

    async function loadSystemPrompt() {
        try {
            const [contentRes, promptRes] = await Promise.all([
                fetch("/data/content.json"),
                fetch("/data/system-prompt.json"),
            ]);
            const content = await contentRes.json();
            const prompt  = await promptRes.json();
            systemPrompt  = buildPrompt(content, prompt);
        } catch (e) {
            console.warn("Could not load prompts:", e);
            systemPrompt  = "You are Yousif Al-Nasser's AI assistant. Be helpful and professional.";
        }
    }

    function buildPrompt(content, prompt) {
        const about    = content.about    || {};
        const skills   = content.skills   || {};
        const projects = content.projects || {};
        const contact  = content.contact  || {};

        const skillsList = (skills.groups || [])
            .map(g => `${g.title}: ${(g.items || []).map(i => i.name).join(", ")}`)
            .join("\n");

        const allProjects = [];
        for (const [cat, items] of Object.entries(projects.groups || {})) {
            items.forEach(p => allProjects.push(`[${cat}] ${p.title}: ${p.description}`));
        }

        const contactInfo = [
            ...(contact.cards || []).map(c => `${c.title}: ${c.value}`),
            ...(contact.socialLinks || []).map(s => `${s.label}: ${s.url}`),
        ].join("\n");

        const rules = (prompt.rules || []).map((r, i) => `${i+1}. ${r}`).join("\n");

        return `${prompt.base || ""}

ABOUT:
${about.description || ""}

SKILLS:
${skillsList}

PROJECTS:
${allProjects.join("\n")}

CONTACT & LINKS:
${contactInfo}

RULES:
${rules}`;
    }

    /* ── Events ── */
    function setupEvents() {
        el.connectBtn.addEventListener("click", toggleConnection);
        el.recordBtn.addEventListener("click", toggleRecording);
        el.sendBtn.addEventListener("click", sendText);
        el.input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendText();
            }
        });
        el.input.addEventListener("input", () => {
            el.input.style.height = "auto";
            el.input.style.height = Math.min(el.input.scrollHeight, 120) + "px";
            // Auto-detect RTL
            const text = el.input.value;
            const isArabic = /[\u0600-\u06FF]/.test(text);
            el.input.dir = isArabic ? "rtl" : "ltr";
        });
    }

    /* ── Connection ── */
    async function toggleConnection() {
        if (isConnected) {
            disconnect();
        } else {
            await connect();
        }
    }

    async function connect() {
        setStatus("connecting", "Connecting...");
        el.connectBtn.disabled = true;

        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
        }
        if (audioCtx.state === "suspended") await audioCtx.resume();

        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: { sampleRate: INPUT_SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });

            const proto = location.protocol === "https:" ? "wss:" : "ws:";
            ws = new WebSocket(`${proto}//${location.host}/ws`);

            ws.onopen = () => {
                ws.send(JSON.stringify({ setup: { system_instruction: systemPrompt } }));
            };

            ws.onmessage = (e) => handleMessage(e);
            ws.onerror   = () => { setStatus("error", "Error"); addSystemMsg("Connection error."); };
            ws.onclose   = () => { if (!isConnected) addSystemMsg("Could not connect."); disconnect(); };

        } catch (err) {
            console.error(err);
            addSystemMsg(err.name === "NotAllowedError"
                ? "Microphone access denied."
                : "Connection failed. Is the server running?");
            setStatus("offline", "Offline");
            el.connectBtn.disabled = false;
        }
    }

    function disconnect() {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;

        if (isRecording) stopRecording();

        const _ws = ws;
        ws = null;
        if (_ws) try { _ws.close(); } catch {}

        stopMicPipeline();

        if (currentSource) { try { currentSource.stop(); } catch {} currentSource = null; }
        audioQueue = [];
        isPlayingAudio = false;

        if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
        if (audioCtx)    { try { audioCtx.close(); } catch {} audioCtx = null; }

        isConnected  = false;
        isThinking   = false;
        isRecording  = false;
        activeAiBubble = null;
        removeThinking();

        el.connectBtn.textContent = "";
        el.connectBtn.innerHTML = '<i class="uil uil-link"></i> Connect';
        el.connectBtn.classList.remove("connected");
        el.connectBtn.disabled = false;
        el.recordBtn.disabled  = true;
        el.input.disabled      = true;
        el.sendBtn.disabled    = true;
        el.hint.textContent    = "Connect to start chatting";
        setStatus("offline", "Offline");
    }

    /* ── Messages ── */
    function handleMessage(event) {
        let data;
        try { data = JSON.parse(event.data); } catch { return; }

        if (data.status === "ready" && !isConnected) {
            isConnected = true;
            setStatus("active", "Connected");
            el.connectBtn.innerHTML = '<i class="uil uil-times"></i> End';
            el.connectBtn.classList.add("connected");
            el.connectBtn.disabled = false;
            el.recordBtn.disabled  = false;
            el.input.disabled      = false;
            el.sendBtn.disabled    = false;
            el.hint.textContent    = "Press mic to talk · Enter to send";
            heartbeatTimer = setInterval(() => {
                if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ping: true }));
            }, 20000);
            return;
        }

        if (data.transcript) {
            removeThinking();
            isThinking = false;
            if (data.type === "model") {
                if (!activeAiBubble) activeAiBubble = addBubble("ai", data.transcript);
                else appendToBubble(activeAiBubble, data.transcript);
                setStatus("thinking", "Responding...");
            } else {
                activeAiBubble = null;
                addBubble("user", data.transcript, true);
            }
            return;
        }

        if (data.audio) {
            queueAudio(base64ToArrayBuffer(data.audio));
            return;
        }

        if (data.error) {
            removeThinking();
            addSystemMsg(`Error: ${data.error}`);
        }
    }

    /* ── Mic Pipeline (for recording) ── */
    async function startMicPipeline() {
        if (!mediaStream) return;
        try {
            inputCtx  = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: INPUT_SAMPLE_RATE });
            await inputCtx.audioWorklet.addModule("/js/audio-processor.js");
            sourceNode = inputCtx.createMediaStreamSource(mediaStream);
            workletNode = new AudioWorkletNode(inputCtx, "pcm-audio-processor");
            sourceNode.connect(workletNode);
            workletNode.connect(inputCtx.destination);
            workletNode.port.onmessage = (e) => {
                if (!isRecording || !ws || ws.readyState !== WebSocket.OPEN) return;
                const pcm16 = float32ToPcm16(e.data);
                try { ws.send(JSON.stringify({ audio: arrayBufferToBase64(pcm16.buffer) })); } catch {}
            };
        } catch (err) {
            console.error("Mic pipeline failed:", err);
        }
    }

    function stopMicPipeline() {
        if (workletNode)  { workletNode.disconnect();  workletNode  = null; }
        if (sourceNode)   { sourceNode.disconnect();   sourceNode   = null; }
        if (inputCtx)     { try { inputCtx.close(); } catch {} inputCtx = null; }
    }

    /* ── Recording Toggle ── */
    async function toggleRecording() {
        if (!isConnected) return;
        if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume();
        if (isRecording) { stopRecording(); } else { await startRecording(); }
    }

    async function startRecording() {
        await startMicPipeline();
        isRecording = true;
        el.recordBtn.classList.add("recording");
        el.recordBtn.innerHTML = '<i class="uil uil-stop-circle"></i>';
        el.recordBtn.title = "Stop recording";
        setStatus("recording", "Recording...");
    }

    function stopRecording() {
        isRecording = false;
        stopMicPipeline();
        el.recordBtn.classList.remove("recording");
        el.recordBtn.innerHTML = '<i class="uil uil-microphone"></i>';
        el.recordBtn.title = "Record voice message";
        if (isConnected) setStatus("active", "Connected");
        showThinking();
        isThinking = true;
    }

    /* ── Text Send ── */
    function sendText() {
        if (!ws || ws.readyState !== WebSocket.OPEN || !isConnected) return;
        const text = el.input.value.trim();
        if (!text) return;

        addBubble("user", text);
        el.input.value = "";
        el.input.style.height = "auto";
        el.input.dir = "ltr";

        try { ws.send(JSON.stringify({ text })); } catch {}
        showThinking();
        isThinking = true;
        activeAiBubble = null;
    }

    /* ── Audio Playback ── */
    function queueAudio(buffer) {
        audioQueue.push(buffer);
        if (!isPlayingAudio) playNext();
    }

    function playNext() {
        if (!audioQueue.length) { isPlayingAudio = false; if (isConnected) setStatus("active", "Connected"); return; }
        if (!audioCtx) { audioQueue = []; isPlayingAudio = false; return; }

        isPlayingAudio = true;
        setStatus("thinking", "Speaking...");

        const samples    = new Int16Array(audioQueue.shift());
        const floats     = new Float32Array(samples.length);
        for (let i = 0; i < samples.length; i++) floats[i] = samples[i] / 32768;

        const buf    = audioCtx.createBuffer(1, floats.length, OUTPUT_SAMPLE_RATE);
        buf.getChannelData(0).set(floats);

        currentSource = audioCtx.createBufferSource();
        currentSource.buffer = buf;
        currentSource.connect(audioCtx.destination);
        currentSource.onended = () => { currentSource = null; playNext(); };
        currentSource.start();
    }

    /* ── UI Helpers ── */
    function setStatus(state, label) {
        el.statusDot.className = "chat-status-dot";
        if (state === "active")     el.statusDot.classList.add("chat-status-dot--active");
        if (state === "thinking")   el.statusDot.classList.add("chat-status-dot--thinking");
        if (state === "recording")  el.statusDot.classList.add("chat-status-dot--recording");
        el.statusText.textContent = label;
    }

    function addBubble(role, text, isVoice = false) {
        if (el.emptyState) el.emptyState.style.display = "none";

        const wrap   = document.createElement("div");
        wrap.className = `chat-msg chat-msg--${role}`;

        const avatar = document.createElement("div");
        avatar.className = `chat-msg__avatar chat-msg__avatar--${role}`;
        avatar.textContent = role === "ai" ? "Y" : "U";

        const bubble = document.createElement("div");
        bubble.className = "chat-msg__bubble";
        if (isVoice) {
            const icon = document.createElement("span");
            icon.style.cssText = "opacity:0.6;margin-right:0.4rem;";
            icon.textContent = "🎤 ";
            bubble.appendChild(icon);
        }
        renderLinks(bubble, text);

        // Auto RTL for Arabic
        if (/[\u0600-\u06FF]/.test(text)) {
            bubble.style.fontFamily = "Cairo, sans-serif";
            bubble.dir = "rtl";
            bubble.style.textAlign = "right";
        }

        wrap.appendChild(avatar);
        wrap.appendChild(bubble);
        el.messages.appendChild(wrap);
        el.messages.scrollTop = el.messages.scrollHeight;
        return bubble;
    }

    function appendToBubble(bubble, text) {
        renderLinks(bubble, text);
        el.messages.scrollTop = el.messages.scrollHeight;
    }

    function addSystemMsg(text) {
        const div = document.createElement("div");
        div.style.cssText = "text-align:center;font-size:0.8rem;color:var(--text-muted);padding:0.5rem;";
        div.textContent = text;
        el.messages.appendChild(div);
        el.messages.scrollTop = el.messages.scrollHeight;
    }

    function showThinking() {
        removeThinking();
        const wrap = document.createElement("div");
        wrap.className = "chat-thinking";
        wrap.id = "chat-thinking";

        const avatar = document.createElement("div");
        avatar.className = "chat-msg__avatar chat-msg__avatar--ai";
        avatar.textContent = "Y";

        const dots = document.createElement("div");
        dots.className = "chat-thinking__dots";
        dots.innerHTML = "<span></span><span></span><span></span>";

        wrap.appendChild(avatar);
        wrap.appendChild(dots);
        el.messages.appendChild(wrap);
        el.messages.scrollTop = el.messages.scrollHeight;
    }

    function removeThinking() {
        const t = document.getElementById("chat-thinking");
        if (t) t.remove();
    }

    function renderLinks(container, text) {
        const urlPattern = /(https?:\/\/[^\s]+)/g;
        const parts = text.split(urlPattern);
        parts.forEach(part => {
            if (!part) return;
            if (/^https?:\/\//.test(part)) {
                const a = document.createElement("a");
                a.href = part;
                a.textContent = part;
                a.target = "_blank";
                a.rel = "noopener noreferrer";
                container.appendChild(a);
            } else {
                container.appendChild(document.createTextNode(part));
            }
        });
    }

    /* ── Utils ── */
    function float32ToPcm16(float32) {
        const out = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
            const s = Math.max(-1, Math.min(1, float32[i]));
            out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return out;
    }

    function arrayBufferToBase64(buf) {
        const bytes = new Uint8Array(buf);
        let b = "";
        for (let i = 0; i < bytes.length; i += 8192)
            b += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(b);
    }

    function base64ToArrayBuffer(b64) {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out.buffer;
    }

    document.addEventListener("DOMContentLoaded", init);
})();
