/* ===================================================================
   ANALYTICS DASHBOARD
   Auth · Stats · Charts · Session Table · Transcript Viewer
   =================================================================== */
(() => {
    "use strict";

    const TOKEN_KEY = "dash_token";
    let   token     = localStorage.getItem(TOKEN_KEY) || "";

    /* ── DOM ── */
    const loginScreen = document.getElementById("login-screen");
    const app         = document.getElementById("app");
    const loginInput  = document.getElementById("login-input");
    const loginBtn    = document.getElementById("login-btn");
    const loginError  = document.getElementById("login-error");
    const logoutBtn   = document.getElementById("logout-btn");
    const refreshBtn  = document.getElementById("refresh-btn");

    /* State */
    let allSessions = [];
    let filteredSessions = [];
    let currentPage  = 1;
    const PAGE_SIZE  = 20;
    let typeFilter   = null;   // null | "voice" | "chat"
    let searchQuery  = "";
    let charts       = {};

    /* ── Auth ── */
    async function tryLogin() {
        const t = loginInput.value.trim();
        if (!t) return;
        loginError.textContent = "";
        loginBtn.disabled = true;
        loginBtn.textContent = "Verifying...";

        try {
            const res = await apiFetch("/api/analytics", t);
            if (res.ok) {
                token = t;
                localStorage.setItem(TOKEN_KEY, token);
                showApp();
            } else {
                loginError.textContent = "Invalid token. Check DASHBOARD_TOKEN env var.";
            }
        } catch {
            loginError.textContent = "Server unreachable.";
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = "Login";
        }
    }

    function logout() {
        localStorage.removeItem(TOKEN_KEY);
        token = "";
        app.style.display   = "none";
        loginScreen.style.display = "flex";
        loginInput.value    = "";
        loginError.textContent = "";
    }

    /* ── API ── */
    async function apiFetch(path, t = token) {
        return fetch(path, { headers: { "X-Dashboard-Token": t } });
    }

    async function loadAnalytics() {
        const res  = await apiFetch("/api/analytics");
        if (!res.ok) { if (res.status === 401) logout(); return null; }
        return res.json();
    }

    async function loadSessions() {
        const res = await apiFetch("/api/sessions?limit=500");
        if (!res.ok) return [];
        const data = await res.json();
        return data.sessions || [];
    }

    async function loadSession(id) {
        const res = await apiFetch(`/api/sessions/${id}`);
        if (!res.ok) return null;
        return res.json();
    }

    /* ── Render ── */
    async function showApp() {
        loginScreen.style.display = "none";
        app.style.display = "block";
        await refreshData();
    }

    async function refreshData() {
        const [analytics, sessions] = await Promise.all([loadAnalytics(), loadSessions()]);
        if (!analytics) return;
        renderStats(analytics);
        renderCharts(analytics);
        allSessions = sessions;
        applyFilter();
    }

    function renderStats(d) {
        setText("stat-sessions",  d.total_sessions);
        setText("stat-messages",  d.total_messages);
        setText("stat-pageviews", d.total_pageviews);
        setText("stat-today",     d.sessions_today);
        setText("stat-pv-today",  d.pageviews_today);
        const dur = d.avg_duration_sec;
        setText("stat-duration",  dur ? formatDuration(dur) : "—");
        const voice = d.type_counts["voice"] || 0;
        const chat  = d.type_counts["chat"]  || 0;
        setText("stat-voice",  voice);
        setText("stat-chat",   chat);
    }

    function renderCharts(d) {
        renderLineChart(
            "chart-sessions",
            d.sessions_per_day,
            "Sessions",
            "rgba(0,212,255,0.8)",
            "rgba(0,212,255,0.15)",
        );
        renderLineChart(
            "chart-pageviews",
            d.views_per_day,
            "Page Views",
            "rgba(245,158,11,0.8)",
            "rgba(245,158,11,0.12)",
        );
        renderBarChart(
            "chart-hours",
            d.msgs_by_hour,
            "Messages",
            "rgba(124,58,237,0.7)",
        );
    }

    function renderLineChart(canvasId, data, label, lineColor, fillColor) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        if (charts[canvasId]) { charts[canvasId].destroy(); }

        // Build 30-day labels
        const days   = [];
        const counts = {};
        const today  = new Date();
        for (let i = 29; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            days.push(key);
            counts[key] = 0;
        }
        data.forEach(r => { if (counts[r.day] !== undefined) counts[r.day] = r.count; });
        const values = days.map(d => counts[d]);
        const labels = days.map(d => {
            const dt = new Date(d + "T00:00:00");
            return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        });

        charts[canvasId] = new Chart(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [{
                    label,
                    data: values,
                    borderColor: lineColor,
                    backgroundColor: fillColor,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: lineColor,
                }]
            },
            options: chartOptions(),
        });
    }

    function renderBarChart(canvasId, data, label, barColor) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        if (charts[canvasId]) { charts[canvasId].destroy(); }

        const hours  = Array.from({ length: 24 }, (_, i) => i);
        const counts = {};
        data.forEach(r => { counts[r.hour] = r.count; });
        const values = hours.map(h => counts[h] || 0);
        const labels = hours.map(h => `${String(h).padStart(2, "0")}h`);

        charts[canvasId] = new Chart(ctx, {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label,
                    data: values,
                    backgroundColor: barColor,
                    borderRadius: 4,
                }]
            },
            options: chartOptions(),
        });
    }

    function chartOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "rgba(18,18,26,0.95)",
                    borderColor: "rgba(255,255,255,0.08)",
                    borderWidth: 1,
                    titleColor: "#f0f0f5",
                    bodyColor: "#a0a0b8",
                    padding: 10,
                    cornerRadius: 8,
                },
            },
            scales: {
                x: {
                    grid: { color: "rgba(255,255,255,0.04)", drawTicks: false },
                    ticks: { color: "#6b6b80", font: { size: 10 }, maxRotation: 45 },
                    border: { display: false },
                },
                y: {
                    grid: { color: "rgba(255,255,255,0.04)", drawTicks: false },
                    ticks: { color: "#6b6b80", font: { size: 10 }, precision: 0 },
                    border: { display: false },
                },
            },
        };
    }

    /* ── Session Table ── */
    function applyFilter() {
        let result = [...allSessions];
        if (typeFilter) result = result.filter(s => s.session_type === typeFilter);
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(s =>
                (s.session_type || "").includes(q) ||
                (s.started_at  || "").includes(q)  ||
                String(s.id).includes(q)
            );
        }
        filteredSessions = result;
        currentPage = 1;
        renderTable();
    }

    function renderTable() {
        const tbody = document.getElementById("sessions-tbody");
        const info  = document.getElementById("sessions-info");
        if (!tbody) return;

        const start = (currentPage - 1) * PAGE_SIZE;
        const page  = filteredSessions.slice(start, start + PAGE_SIZE);

        if (filteredSessions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="sessions-empty">No sessions found</td></tr>`;
            info.textContent = "0 sessions";
            renderPagination();
            return;
        }

        tbody.innerHTML = page.map(s => {
            const dur  = s.ended_at ? formatDuration(
                (new Date(s.ended_at) - new Date(s.started_at)) / 1000
            ) : "Active";
            const date = new Date(s.started_at).toLocaleString("en-US", {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
            });
            const type = s.session_type || "voice";
            const hasRec = !!s.recording_path;
            const recCell = hasRec
                ? `<div class="rec-actions">
                     <button class="rec-btn play-btn" data-id="${s.id}" title="Play recording">▶</button>
                     <a class="rec-btn dl-btn" href="/api/sessions/${s.id}/audio" download="session_${s.id}.wav"
                        data-token="${token}" title="Download WAV">⬇</a>
                   </div>`
                : `<span style="color:var(--text3);font-size:0.75rem;">—</span>`;
            return `
              <tr data-id="${s.id}">
                <td style="color:var(--text3);font-size:0.75rem;">#${s.id}</td>
                <td style="color:var(--text);font-size:0.82rem;">${date}</td>
                <td><span class="type-badge ${type}">${type === "voice" ? "🎙 Voice" : "💬 Chat"}</span></td>
                <td style="color:var(--text);">${s.message_count}</td>
                <td style="color:var(--text2);">${dur}</td>
                <td style="color:var(--text3);font-size:0.75rem;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.ip_address || "—"}</td>
                <td onclick="event.stopPropagation()">${recCell}</td>
              </tr>`;
        }).join("");

        // Row click → open modal
        tbody.querySelectorAll("tr[data-id]").forEach(row => {
            row.addEventListener("click", () => openSessionModal(Number(row.dataset.id)));
        });

        // Play button → inline audio player
        tbody.querySelectorAll(".play-btn").forEach(btn => {
            btn.addEventListener("click", e => {
                e.stopPropagation();
                playInlineAudio(Number(btn.dataset.id), btn);
            });
        });

        // Download link — inject auth header via fetch + blob
        tbody.querySelectorAll(".dl-btn").forEach(a => {
            a.addEventListener("click", async e => {
                e.preventDefault();
                const id = a.href.match(/\/api\/sessions\/(\d+)/)?.[1];
                if (!id) return;
                const res = await apiFetch(`/api/sessions/${id}/audio`);
                if (!res.ok) return;
                const blob = await res.blob();
                const url  = URL.createObjectURL(blob);
                const tmp  = document.createElement("a");
                tmp.href = url; tmp.download = `session_${id}.wav`;
                tmp.click();
                URL.revokeObjectURL(url);
            });
        });

        info.textContent = `${filteredSessions.length} session${filteredSessions.length !== 1 ? "s" : ""}`;
        renderPagination();
    }

    function renderPagination() {
        const totalPages = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE));
        const prev = document.getElementById("page-prev");
        const next = document.getElementById("page-next");
        const info = document.getElementById("page-info");
        if (!prev) return;
        prev.disabled = currentPage <= 1;
        next.disabled = currentPage >= totalPages;
        info.textContent = `Page ${currentPage} / ${totalPages}`;
    }

    /* ── Inline Audio Player ── */
    let currentAudio = null;

    async function playInlineAudio(id, btn) {
        // Stop any existing audio
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
            document.querySelectorAll(".play-btn").forEach(b => { b.textContent = "▶"; b.classList.remove("playing"); });
            if (Number(btn.dataset.id) === id && !btn.classList.contains("playing") === false) return;
        }

        btn.textContent = "⏳";
        btn.disabled = true;

        try {
            const res = await apiFetch(`/api/sessions/${id}/audio`);
            if (!res.ok) { btn.textContent = "✕"; setTimeout(() => { btn.textContent = "▶"; btn.disabled = false; }, 1500); return; }

            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            currentAudio = new Audio(url);
            currentAudio.play();
            btn.textContent = "⏸";
            btn.disabled = false;
            btn.classList.add("playing");

            currentAudio.onpause = currentAudio.onended = () => {
                btn.textContent = "▶";
                btn.classList.remove("playing");
                URL.revokeObjectURL(url);
                currentAudio = null;
            };

            btn.onclick = e => {
                e.stopPropagation();
                if (currentAudio && !currentAudio.paused) {
                    currentAudio.pause();
                } else if (currentAudio) {
                    currentAudio.play();
                    btn.textContent = "⏸";
                    btn.classList.add("playing");
                }
            };
        } catch {
            btn.textContent = "▶";
            btn.disabled = false;
        }
    }

    /* ── Session Modal ── */
    async function openSessionModal(id) {
        const data = await loadSession(id);
        if (!data) return;

        const { session, messages } = data;
        const dur  = session.ended_at
            ? formatDuration((new Date(session.ended_at) - new Date(session.started_at)) / 1000)
            : "Ongoing";
        const date = new Date(session.started_at).toLocaleString("en-US", {
            dateStyle: "medium", timeStyle: "short"
        });
        const type = session.session_type || "voice";

        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
          <div class="modal">
            <div class="modal-header">
              <div class="modal-title">Session #${session.id} — Transcript</div>
              <button class="modal-close" id="modal-close-btn">&times;</button>
            </div>
            <div class="modal-meta">
              <span><strong style="color:var(--text2)">Type:</strong> ${type}</span>
              <span><strong style="color:var(--text2)">Date:</strong> ${date}</span>
              <span><strong style="color:var(--text2)">Duration:</strong> ${dur}</span>
              <span><strong style="color:var(--text2)">Messages:</strong> ${session.message_count}</span>
              ${session.ip_address ? `<span><strong style="color:var(--text2)">IP:</strong> ${session.ip_address}</span>` : ""}
            </div>
            ${session.recording_path ? `
            <div class="modal-audio" id="modal-audio-section">
              <div class="modal-audio__label">🎙 AI Voice Recording</div>
              <audio id="modal-audio-player" controls style="width:100%;height:36px;"></audio>
              <a class="modal-audio__dl" id="modal-audio-dl" download="session_${session.id}.wav">⬇ Download WAV</a>
            </div>` : ""}
            <div class="modal-body" id="modal-messages">
              ${messages.length === 0
                ? `<div style="text-align:center;color:var(--text3);padding:2rem;">No messages recorded</div>`
                : messages.map(m => renderMsgRow(m)).join("")
              }
            </div>
          </div>`;

        document.body.appendChild(overlay);

        overlay.querySelector("#modal-close-btn").addEventListener("click", () => { cleanupModalAudio(); overlay.remove(); });
        overlay.addEventListener("click", e => { if (e.target === overlay) { cleanupModalAudio(); overlay.remove(); } });

        // Load audio blob (requires auth header, can't use src= directly)
        if (session.recording_path) {
            const player = overlay.querySelector("#modal-audio-player");
            const dlLink = overlay.querySelector("#modal-audio-dl");
            apiFetch(`/api/sessions/${session.id}/audio`).then(async res => {
                if (!res.ok) return;
                const blob = await res.blob();
                const url  = URL.createObjectURL(blob);
                player.src = url;
                dlLink.href = url;
                player._blobUrl = url;
            }).catch(() => {});
        }

        function cleanupModalAudio() {
            const player = overlay.querySelector("#modal-audio-player");
            if (player?._blobUrl) URL.revokeObjectURL(player._blobUrl);
        }
    }

    function renderMsgRow(m) {
        const time = new Date(m.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        return `
          <div class="msg-row ${m.role}">
            <div class="msg-avatar ${m.role}">${m.role === "model" ? "AI" : "U"}</div>
            <div>
              <div class="msg-bubble ${m.role}">${escapeHtml(m.content)}</div>
              <div class="msg-time" style="${m.role === "user" ? "text-align:right" : ""}">${time}</div>
            </div>
          </div>`;
    }

    /* ── Helpers ── */
    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function formatDuration(secs) {
        if (secs < 60) return `${Math.round(secs)}s`;
        if (secs < 3600) return `${Math.round(secs / 60)}m`;
        return `${(secs / 3600).toFixed(1)}h`;
    }

    /* ── Event Wiring ── */
    function setupEvents() {
        loginBtn.addEventListener("click", tryLogin);
        loginInput.addEventListener("keydown", e => { if (e.key === "Enter") tryLogin(); });
        logoutBtn.addEventListener("click", logout);
        refreshBtn.addEventListener("click", refreshData);

        // Search
        const searchEl = document.getElementById("sessions-search");
        if (searchEl) {
            searchEl.addEventListener("input", () => {
                searchQuery = searchEl.value.trim();
                applyFilter();
            });
        }

        // Type filters
        document.querySelectorAll(".filter-btn[data-type]").forEach(btn => {
            btn.addEventListener("click", () => {
                const t = btn.dataset.type;
                typeFilter = typeFilter === t ? null : t;
                document.querySelectorAll(".filter-btn[data-type]").forEach(b => {
                    b.className = "filter-btn" + (b.dataset.type === typeFilter ? ` active-${typeFilter}` : "");
                });
                applyFilter();
            });
        });

        // Pagination
        const prevBtn = document.getElementById("page-prev");
        const nextBtn = document.getElementById("page-next");
        if (prevBtn) prevBtn.addEventListener("click", () => { currentPage--; renderTable(); });
        if (nextBtn) nextBtn.addEventListener("click", () => { currentPage++; renderTable(); });
    }

    /* ── Init ── */
    function init() {
        setupEvents();
        if (token) {
            showApp();
        }
        // else login screen is visible by default
    }

    document.addEventListener("DOMContentLoaded", init);
})();
