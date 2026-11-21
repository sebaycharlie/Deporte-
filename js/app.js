// ==========================================
// Seba FitPro — Lógica de la aplicación
// ==========================================
"use strict";

const APP_VERSION = "2.0.0";
const STORAGE_KEY = "seba_fitpro_v1_state"; // se mantiene para no perder datos de la v1
const SCHEMA_VERSION = 2;
const LB_PER_KG = 2.20462;

// ------------------------------------------
// Utilidades
// ------------------------------------------
const $ = (id) => document.getElementById(id);
const deepClone = (o) => JSON.parse(JSON.stringify(o));
function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function num(v, def = 0) { const n = parseFloat(v); return Number.isFinite(n) ? n : def; }
function int(v, def = 0) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; }
function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }
function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function str(v, max = 500) { return String(v ?? "").slice(0, max); }
function safeId(v) {
    const s = String(v ?? "").replace(/[^\w-]/g, "_").slice(0, 64);
    return s || "id_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function uid(prefix) { return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ------------------------------------------
// Estado por defecto + normalización (protege contra datos corruptos o importados maliciosos)
// ------------------------------------------
const CATEGORIES = ["heavy", "moderate", "isolation"];

function makeProfile(id, name, opts = {}) {
    return {
        id, name,
        bodyweight: opts.bodyweight ?? 75,
        unit: opts.unit ?? "kg",
        restHeavy: opts.restHeavy ?? 150,
        restIso: opts.restIso ?? 90,
        mesocycle: 1,
        routine: deepClone(DEFAULT_ROUTINE),
        logs: {},       // logs[week][day][exId] = [{weight, reps, rir, done}]
        readiness: {},  // readiness[week][day] = {mood, energy, freshness, potency, score, loadDeltaFactor, rirShift}
        swaps: {},      // swaps[week][day][exId] = {name, baseWeight, cue, addsBodyweight} (reemplazo temporal)
        history: []
    };
}

function defaultState() {
    return {
        schemaVersion: SCHEMA_VERSION,
        currentProfileId: "seba",
        role: "athlete",
        selectedWeek: 1,
        selectedDay: 1,
        onboarded: false,
        lastBackupAt: null,
        profiles: { seba: makeProfile("seba", "Seba", { bodyweight: 78, restHeavy: 165 }) }
    };
}

function normalizeSet(s) {
    s = obj(s);
    return { weight: Math.max(0, num(s.weight, 0)), reps: Math.max(0, int(s.reps, 0)), rir: clamp(num(s.rir, 2), 0, 10), done: !!s.done };
}

function normalizeExercise(ex, d, i, usedIds) {
    ex = obj(ex);
    let id = safeId(ex.id || `d${d}_x${i}`);
    while (usedIds.has(id)) id = id + "_b";
    usedIds.add(id);
    return {
        id,
        order: int(ex.order, i + 1),
        name: str(ex.name || "Ejercicio", 120),
        category: CATEGORIES.includes(ex.category) ? ex.category : "moderate",
        altKey: EXERCISE_ALTERNATIVES[ex.altKey] ? ex.altKey : "remo",
        sets: clamp(int(ex.sets, 3), 1, 10),
        repsTarget: str(ex.repsTarget || "8-10", 20),
        baseWeight: Math.max(0, num(ex.baseWeight, 0)),
        restSec: clamp(int(ex.restSec, 90), 15, 900),
        addsBodyweight: !!ex.addsBodyweight,
        cue: str(ex.cue, 400),
        steps: str(ex.steps, 1500),
        commonError: str(ex.commonError, 400)
    };
}

function normalizeWeekDayMap(src, mapper) {
    const out = {};
    const s = obj(src);
    for (let w = 1; w <= 4; w++) {
        const wk = obj(s[w]);
        for (let d = 1; d <= 4; d++) {
            if (wk[d] === undefined) continue;
            const v = mapper(wk[d]);
            if (v === undefined) continue;
            if (!out[w]) out[w] = {};
            out[w][d] = v;
        }
    }
    return out;
}

function normalizeHistory(h) {
    h = obj(h);
    const details = {};
    Object.entries(obj(h.details)).forEach(([k, v]) => { if (Array.isArray(v)) details[safeId(k)] = v.map(normalizeSet); });
    const exNames = {};
    Object.entries(obj(h.exNames)).forEach(([k, v]) => { exNames[safeId(k)] = str(v, 120); });
    return {
        id: safeId(h.id || uid("sess")),
        date: str(h.date, 60),
        isoDate: str(h.isoDate, 40),
        mesocycle: Math.max(1, int(h.mesocycle, 1)),
        week: clamp(int(h.week, 1), 1, 4),
        day: clamp(int(h.day, 1), 1, 4),
        dayTitle: str(h.dayTitle, 120),
        tonnage: Math.round(num(h.tonnage, 0)),
        setsDone: Math.max(0, int(h.setsDone, 0)),
        setsTotal: Math.max(0, int(h.setsTotal, 0)),
        prs: Math.max(0, int(h.prs, 0)),
        readinessScore: clamp(int(h.readinessScore, 80), 0, 100),
        rpe: clamp(int(h.rpe, 8), 1, 10),
        pump: str(h.pump, 60),
        pain: str(h.pain, 60),
        notes: str(h.notes, 2000),
        coachFeedback: str(h.coachFeedback, 2000),
        details, exNames
    };
}

function normalizeProfile(raw, fallbackId) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Perfil inválido");
    const p = {};
    p.id = safeId(raw.id || fallbackId);
    p.name = str(raw.name || "Atleta", 60).trim() || "Atleta";
    p.bodyweight = clamp(num(raw.bodyweight, 75), 20, 500);
    p.unit = raw.unit === "lb" ? "lb" : "kg";
    p.restHeavy = clamp(int(raw.restHeavy, 150), 15, 900);
    p.restIso = clamp(int(raw.restIso, 90), 15, 900);
    p.mesocycle = Math.max(1, int(raw.mesocycle, 1));

    const srcRoutine = obj(raw.routine);
    const usedIds = new Set();
    p.routine = {};
    for (let d = 1; d <= 4; d++) {
        const day = srcRoutine[d] ? obj(srcRoutine[d]) : deepClone(DEFAULT_ROUTINE[d]);
        p.routine[d] = {
            title: str(day.title || DEFAULT_ROUTINE[d].title, 120),
            short: str(day.short || DEFAULT_ROUTINE[d].short, 40),
            focus: str(day.focus, 200),
            exercises: Array.isArray(day.exercises) ? day.exercises.map((ex, i) => normalizeExercise(ex, d, i, usedIds)) : []
        };
    }
    // Migración v1 → v2: la dominada lastrada suma el peso corporal
    if (!raw.mesocycle && p.routine[1].exercises.some(e => e.id === "d1_e2" && /dominada/i.test(e.name))) {
        p.routine[1].exercises.find(e => e.id === "d1_e2").addsBodyweight = true;
    }

    p.logs = {};
    Object.entries(obj(raw.logs)).forEach(([w, wk]) => {
        const wi = int(w, 0); if (wi < 1 || wi > 4) return;
        Object.entries(obj(wk)).forEach(([d, dd]) => {
            const di = int(d, 0); if (di < 1 || di > 4) return;
            Object.entries(obj(dd)).forEach(([exId, arr]) => {
                if (!Array.isArray(arr)) return;
                p.logs[wi] = p.logs[wi] || {};
                p.logs[wi][di] = p.logs[wi][di] || {};
                p.logs[wi][di][safeId(exId)] = arr.slice(0, 15).map(normalizeSet);
            });
        });
    });

    p.readiness = normalizeWeekDayMap(raw.readiness, (r) => {
        r = obj(r);
        const vals = ["mood", "energy", "freshness", "potency"].map(k => clamp(int(r[k], 4), 1, 5));
        return { ...computeReadiness(...vals), mood: vals[0], energy: vals[1], freshness: vals[2], potency: vals[3] };
    });

    p.swaps = {};
    Object.entries(obj(raw.swaps)).forEach(([w, wk]) => {
        Object.entries(obj(wk)).forEach(([d, dd]) => {
            Object.entries(obj(dd)).forEach(([exId, s]) => {
                s = obj(s);
                const wi = int(w, 0), di = int(d, 0);
                if (wi < 1 || wi > 4 || di < 1 || di > 4 || !s.name) return;
                p.swaps[wi] = p.swaps[wi] || {};
                p.swaps[wi][di] = p.swaps[wi][di] || {};
                p.swaps[wi][di][safeId(exId)] = { name: str(s.name, 120), baseWeight: Math.max(0, num(s.baseWeight, 0)), cue: str(s.cue, 400), addsBodyweight: !!s.addsBodyweight };
            });
        });
    });

    p.history = Array.isArray(raw.history) ? raw.history.filter(h => h && typeof h === "object").slice(0, 2000).map(normalizeHistory) : [];
    return p;
}

function normalizeState(s) {
    s = obj(s);
    const st = defaultState();
    const profiles = {};
    Object.entries(obj(s.profiles)).forEach(([k, p]) => {
        try { const np = normalizeProfile(p, k); profiles[np.id] = np; } catch (e) { console.warn("Perfil descartado", k, e); }
    });
    if (Object.keys(profiles).length) st.profiles = profiles;
    st.currentProfileId = st.profiles[s.currentProfileId] ? s.currentProfileId : Object.keys(st.profiles)[0];
    st.role = s.role === "coach" ? "coach" : "athlete";
    st.selectedWeek = clamp(int(s.selectedWeek, 1), 1, 4);
    st.selectedDay = clamp(int(s.selectedDay, 1), 1, 4);
    st.onboarded = s.onboarded === undefined ? true : !!s.onboarded; // usuarios de v1 ya están "onboarded"
    st.lastBackupAt = s.lastBackupAt || null;
    return st;
}

let appState = defaultState();
let storageAvailable = true;

function loadState() {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { storageAvailable = false; return false; }
    if (!saved) return false;
    try {
        appState = normalizeState(JSON.parse(saved));
        return true;
    } catch (e) {
        console.warn("Datos guardados ilegibles:", e);
        try { localStorage.setItem(STORAGE_KEY + "_corrupt_" + Date.now(), saved); } catch (_) { /* sin espacio */ }
        setTimeout(() => showToast("⚠️ Los datos guardados estaban dañados. Se guardó una copia y se reinició la app.", "warn"), 300);
        return false;
    }
}

let saveWarned = false;
function saveState() {
    if (!storageAvailable) return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    } catch (e) {
        console.error("Error saving state:", e);
        if (!saveWarned) {
            saveWarned = true;
            showToast("⚠️ No se pudo guardar (almacenamiento lleno o bloqueado). Descarga un respaldo.", "warn");
        }
    }
}

function getCurrentProfile() {
    return appState.profiles[appState.currentProfileId] || Object.values(appState.profiles)[0];
}

// ------------------------------------------
// Cálculos de entrenamiento (funciones puras)
// ------------------------------------------
function computeReadiness(mood, energy, freshness, potency) {
    const score = Math.round((mood * 0.2 + energy * 0.3 + freshness * 0.2 + potency * 0.3) / 5 * 100);
    let level, loadDeltaFactor, rirShift;
    if (score >= 80) { level = "high"; loadDeltaFactor = 1.025; rirShift = 0; }
    else if (score >= 55) { level = "mid"; loadDeltaFactor = 1.0; rirShift = 0; }
    else { level = "low"; loadDeltaFactor = 0.92; rirShift = 1; }
    return { score, loadDeltaFactor, rirShift, level };
}

function plannedSets(ex, w) { return w === 4 ? Math.max(2, ex.sets - 1) : ex.sets; }
function minReps(ex) { const m = String(ex.repsTarget).match(/\d+/); return m ? int(m[0], 8) : 8; }
function maxReps(ex) { const all = String(ex.repsTarget).match(/\d+/g); return all ? int(all[all.length - 1], 8) : minReps(ex); }
function targetRir(w, shift = 0) { return Math.floor(MESOCYCLE_WEEKS[w].targetRirNum) + shift; }

function roundToGymPlate(weight, unit = "kg") {
    if (!(weight > 0)) return 0;
    const step = unit === "lb" ? 1 : 0.5;
    return Math.round(weight / step) * step;
}

// Epley. Con RIR opcional (reps + RIR = reps hasta el fallo).
function calculate1RM(load, reps, rir = 0) {
    load = num(load, 0); reps = num(reps, 0);
    if (load <= 0 || reps <= 0) return 0;
    const r = reps + Math.max(0, num(rir, 0));
    if (r <= 1) return load;
    return Math.round(load * (1 + r / 30) * 10) / 10;
}

function effectiveLoad(ex, weight) {
    return (ex.addsBodyweight ? getCurrentProfile().bodyweight : 0) + num(weight, 0);
}

// ------------------------------------------
// Inicialización
// ------------------------------------------
function init() {
    loadState();
    renderProfileSelector();
    updateRoleUI();
    selectWeek(appState.selectedWeek, false);
    selectDay(appState.selectedDay, false);
    loadReadinessForCurrentSession();
    renderExercises();
    updateTimerDisplay();
    $("appVersion").textContent = APP_VERSION;

    if (!storageAvailable) {
        showToast("⚠️ Tu navegador bloquea el guardado local (¿modo incógnito?). El progreso no se guardará.", "warn");
    }
    if (!appState.onboarded) openOnboarding();
    else checkBackupReminder();

    // Cerrar modales con Escape o clic en el fondo
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") document.querySelectorAll(".modal:not(.hidden)").forEach(m => { if (m.id !== "onboardingModal") m.classList.add("hidden"); });
    });
    document.querySelectorAll(".modal").forEach(m => m.addEventListener("click", (e) => {
        if (e.target === m && m.id !== "onboardingModal") m.classList.add("hidden");
    }));
    // Desbloquear audio en iOS con el primer toque
    document.addEventListener("pointerdown", unlockAudio, { once: true });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) timerTick(); });

    // Pedir almacenamiento persistente (evita que el navegador borre los datos)
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

    // PWA (solo en http/https)
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
        navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW no registrado", e));
    }
}

window.addEventListener("error", (e) => {
    console.error(e.error || e.message);
    showToast("⚠️ Ocurrió un error inesperado. Tus datos siguen guardados.", "warn");
});

function showToast(msg, type = "success") {
    const container = $("toastContainer");
    if (!container) return;
    const toast = document.createElement("div");
    const colors = type === "success"
        ? "bg-zinc-900 border-emerald-500/50 text-emerald-300"
        : type === "info"
        ? "bg-zinc-900 border-cyan-500/50 text-cyan-300"
        : "bg-zinc-900 border-amber-500/50 text-amber-300";
    toast.className = `toast pointer-events-auto border ${colors} px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold flex items-center justify-between gap-3 transition-all duration-300`;
    toast.setAttribute("role", "status");
    const span = document.createElement("span");
    span.textContent = msg; // textContent: nunca interpreta HTML
    const btn = document.createElement("button");
    btn.className = "text-zinc-500 hover:text-white";
    btn.setAttribute("aria-label", "Cerrar");
    btn.textContent = "✕";
    btn.onclick = () => toast.remove();
    toast.append(span, btn);
    container.appendChild(toast);
    while (container.children.length > 4) container.firstChild.remove();
    setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 300); }, 3500);
}

function switchTab(tabName) {
    ["workout", "analytics", "history", "guide"].forEach(t => {
        $(`view-${t}`).classList.add("hidden");
        const btn = $(`tab-${t}`);
        btn.classList.remove("border-emerald-500", "text-emerald-400");
        btn.classList.add("border-transparent", "text-zinc-400");
        btn.setAttribute("aria-selected", "false");
    });
    $(`view-${tabName}`).classList.remove("hidden");
    const activeBtn = $(`tab-${tabName}`);
    activeBtn.classList.add("border-emerald-500", "text-emerald-400");
    activeBtn.classList.remove("border-transparent", "text-zinc-400");
    activeBtn.setAttribute("aria-selected", "true");

    if (tabName === "analytics") {
        populateChartExerciseSelect();
        renderAnalytics();
    } else if (tabName === "history") {
        renderHistory();
    }
}

function openModal(id) { $(id).classList.remove("hidden"); }
function closeModal(id) { $(id).classList.add("hidden"); }

// ------------------------------------------
// Onboarding (primer uso — ideal para amigos)
// ------------------------------------------
function openOnboarding() {
    $("ob-name").value = "";
    $("ob-weight").value = 75;
    $("ob-unit").value = "kg";
    openModal("onboardingModal");
}

function finishOnboarding() {
    const name = $("ob-name").value.trim();
    if (!name) { showToast("Escribe tu nombre para comenzar", "warn"); $("ob-name").focus(); return; }
    const prof = getCurrentProfile();
    prof.name = name.slice(0, 60);
    prof.bodyweight = clamp(num($("ob-weight").value, 75), 20, 500);
    const unit = $("ob-unit").value === "lb" ? "lb" : "kg";
    if (unit !== prof.unit) convertProfileUnits(prof, unit);
    appState.onboarded = true;
    saveState();
    renderProfileSelector();
    renderExercises();
    closeModal("onboardingModal");
    showToast(`¡Bienvenido/a, ${prof.name}! Ajusta los pesos base en la Semana 1.`);
}

// ------------------------------------------
// Perfiles y rol
// ------------------------------------------
function renderProfileSelector() {
    const sel = $("profileSelect");
    sel.innerHTML = "";
    Object.values(appState.profiles).forEach(prof => {
        const opt = document.createElement("option");
        opt.value = prof.id;
        opt.textContent = `👤 ${prof.name} (${prof.unit})`;
        if (prof.id === appState.currentProfileId) opt.selected = true;
        sel.appendChild(opt);
    });
}

function switchProfile(id) {
    if (!appState.profiles[id]) return;
    appState.currentProfileId = id;
    saveState();
    loadReadinessForCurrentSession();
    renderExercises();
    refreshActiveView();
    showToast(`Perfil cambiado a ${getCurrentProfile().name}`, "info");
}

function refreshActiveView() {
    if (!$("view-analytics").classList.contains("hidden")) { populateChartExerciseSelect(); renderAnalytics(); }
    if (!$("view-history").classList.contains("hidden")) renderHistory();
}

function toggleRole() {
    appState.role = appState.role === "athlete" ? "coach" : "athlete";
    saveState();
    updateRoleUI();
    renderExercises();
    if (!$("view-history").classList.contains("hidden")) renderHistory();
    showToast(appState.role === "coach" ? "Modo Entrenador activado" : "Modo Atleta activado", "info");
}

function updateRoleUI() {
    const isCoach = appState.role === "coach";
    const badge = $("roleBadge");
    const btn = $("roleToggleBtn");
    const banner = $("coachModeBanner");
    if (isCoach) {
        badge.textContent = "Entrenador";
        badge.className = "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30";
        btn.innerHTML = `<span>🏃</span><span class="hidden sm:inline">Volver a Atleta</span>`;
        banner.classList.remove("hidden");
    } else {
        badge.textContent = "Atleta";
        badge.className = "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30";
        btn.innerHTML = `<span>👨‍🏫</span><span class="hidden sm:inline">Modo Entrenador</span>`;
        banner.classList.add("hidden");
    }
}

function openProfileModal() {
    const prof = getCurrentProfile();
    $("prof-name").value = prof.name;
    $("prof-weight").value = prof.bodyweight;
    $("prof-unit").value = prof.unit;
    $("prof-rest-heavy").value = prof.restHeavy;
    $("prof-rest-iso").value = prof.restIso;
    $("prof-apply-rest").checked = false;
    $("deleteProfileBtn").classList.toggle("hidden", Object.keys(appState.profiles).length <= 1);
    openModal("profileModal");
}

// Convierte todas las cargas del perfil al cambiar kg ↔ lb
function convertProfileUnits(prof, newUnit) {
    if (prof.unit === newUnit) return;
    const f = newUnit === "lb" ? LB_PER_KG : 1 / LB_PER_KG;
    const conv = (v) => roundToGymPlate(num(v) * f, newUnit);
    prof.bodyweight = Math.round(prof.bodyweight * f * 10) / 10;
    Object.values(prof.routine).forEach(d => d.exercises.forEach(ex => { ex.baseWeight = conv(ex.baseWeight); }));
    Object.values(prof.logs).forEach(wk => Object.values(wk).forEach(dd => Object.values(dd).forEach(arr => arr.forEach(s => { s.weight = conv(s.weight); }))));
    Object.values(prof.swaps).forEach(wk => Object.values(wk).forEach(dd => Object.values(dd).forEach(s => { s.baseWeight = conv(s.baseWeight); })));
    prof.history.forEach(h => {
        h.tonnage = Math.round(h.tonnage * f);
        Object.values(h.details).forEach(arr => arr.forEach(s => { s.weight = conv(s.weight); }));
    });
    prof.unit = newUnit;
}

function saveProfileSettings() {
    const prof = getCurrentProfile();
    const newUnit = $("prof-unit").value === "lb" ? "lb" : "kg";
    if (newUnit !== prof.unit) {
        convertProfileUnits(prof, newUnit);
        showToast(`Cargas convertidas a ${newUnit}`, "info");
    } else {
        prof.bodyweight = clamp(num($("prof-weight").value, 75), 20, 500);
    }
    prof.name = $("prof-name").value.trim().slice(0, 60) || "Atleta";
    prof.restHeavy = clamp(int($("prof-rest-heavy").value, 150), 15, 900);
    prof.restIso = clamp(int($("prof-rest-iso").value, 90), 15, 900);

    if ($("prof-apply-rest").checked) {
        const mid = Math.round((prof.restHeavy + prof.restIso) / 2 / 15) * 15;
        Object.values(prof.routine).forEach(d => d.exercises.forEach(ex => {
            ex.restSec = ex.category === "heavy" ? prof.restHeavy : ex.category === "moderate" ? mid : prof.restIso;
        }));
    }
    saveState();
    renderProfileSelector();
    renderExercises();
    closeModal("profileModal");
    showToast("Configuración de perfil guardada");
}

function createNewAthleteProfile() {
    const newName = prompt("Nombre del nuevo atleta:");
    if (!newName || !newName.trim()) return;
    const id = uid("ath");
    appState.profiles[id] = makeProfile(id, newName.trim().slice(0, 60));
    appState.currentProfileId = id;
    saveState();
    renderProfileSelector();
    closeModal("profileModal");
    loadReadinessForCurrentSession();
    renderExercises();
    showToast(`Perfil creado para ${newName.trim()}`);
}

function deleteCurrentProfile() {
    const ids = Object.keys(appState.profiles);
    if (ids.length <= 1) return;
    const prof = getCurrentProfile();
    if (!confirm(`¿Eliminar el perfil "${prof.name}" y TODO su historial? Esta acción no se puede deshacer.`)) return;
    delete appState.profiles[prof.id];
    appState.currentProfileId = Object.keys(appState.profiles)[0];
    saveState();
    renderProfileSelector();
    closeModal("profileModal");
    loadReadinessForCurrentSession();
    renderExercises();
    showToast("Perfil eliminado", "info");
}

// ------------------------------------------
// Semana y día
// ------------------------------------------
function selectWeek(weekNum, shouldRender = true) {
    weekNum = clamp(int(weekNum, 1), 1, 4);
    appState.selectedWeek = weekNum;
    saveState();
    for (let w = 1; w <= 4; w++) {
        const btn = $(`weekBtn-${w}`);
        btn.setAttribute("aria-pressed", String(w === weekNum));
        btn.className = w === weekNum
            ? "week-btn py-2 px-2 rounded-xl text-xs font-bold border border-emerald-500 bg-emerald-500/15 text-emerald-300 transition text-center shadow-sm"
            : "week-btn py-2 px-2 rounded-xl text-xs font-bold border border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700 transition text-center";
    }
    const wData = MESOCYCLE_WEEKS[weekNum];
    $("weekRirTag").textContent = `RIR Objetivo: ${wData.rir}`;
    $("phaseDescText").textContent = wData.desc;
    if (shouldRender) {
        loadReadinessForCurrentSession();
        renderExercises();
    }
}

function selectDay(dayNum, shouldRender = true) {
    dayNum = clamp(int(dayNum, 1), 1, 4);
    appState.selectedDay = dayNum;
    saveState();
    for (let d = 1; d <= 4; d++) {
        const btn = $(`dayBtn-${d}`);
        btn.setAttribute("aria-pressed", String(d === dayNum));
        btn.className = d === dayNum
            ? "day-btn relative py-2 px-2.5 rounded-xl text-xs font-bold border border-cyan-500 bg-cyan-500/15 text-cyan-300 transition text-left shadow-sm"
            : "day-btn relative py-2 px-2.5 rounded-xl text-xs font-bold border border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700 transition text-left";
    }
    if (shouldRender) {
        loadReadinessForCurrentSession();
        renderExercises();
    }
}

function findSavedSession(prof, w, d, meso = prof.mesocycle) {
    return prof.history.find(h => h.mesocycle === meso && h.week === w && h.day === d) || null;
}

// Marca ✓ en los días/semanas ya guardados en el mesociclo actual
function refreshSessionBadges() {
    const prof = getCurrentProfile();
    const w = appState.selectedWeek;
    for (let d = 1; d <= 4; d++) {
        const short = prof.routine[d].short || DEFAULT_ROUTINE[d].short;
        $(`dayLabel-${d}`).textContent = short;
        $(`dayCheck-${d}`).classList.toggle("hidden", !findSavedSession(prof, w, d));
    }
    for (let wk = 1; wk <= 4; wk++) {
        const all = [1, 2, 3, 4].every(d => findSavedSession(prof, wk, d));
        $(`weekCheck-${wk}`).classList.toggle("hidden", !all);
    }
    $("mesoLabel").textContent = `Mesociclo #${prof.mesocycle}`;
}

// ------------------------------------------
// Readiness y autoregulación
// ------------------------------------------
function toggleReadinessBody() {
    const body = $("readinessBody");
    const btn = $("toggleReadinessBtn");
    body.classList.toggle("hidden");
    btn.textContent = body.classList.contains("hidden") ? "Mostrar Panel" : "Ocultar Panel";
}

function getReadinessData(w = appState.selectedWeek, d = appState.selectedDay) {
    const r = getCurrentProfile().readiness?.[w]?.[d];
    return r || { mood: 4, energy: 4, freshness: 4, potency: 4, ...computeReadiness(4, 4, 4, 4) };
}

function loadReadinessForCurrentSession() {
    const r = getReadinessData();
    $("input-mood").value = r.mood;
    $("input-energy").value = r.energy;
    $("input-freshness").value = r.freshness;
    $("input-potency").value = r.potency;
    updateReadiness(false);
}

function updateReadiness(save = true) {
    const mood = int($("input-mood").value, 4);
    const energy = int($("input-energy").value, 4);
    const freshness = int($("input-freshness").value, 4);
    const potency = int($("input-potency").value, 4);

    $("val-mood").textContent = `${mood}/5`;
    $("val-energy").textContent = `${energy}/5`;
    $("val-freshness").textContent = `${freshness}/5`;
    $("val-potency").textContent = `${potency}/5`;

    const r = computeReadiness(mood, energy, freshness, potency);
    const box = $("readinessResultBox");
    const circle = $("readinessScoreCircle");
    const title = $("readinessStatusTitle");
    const badge = $("readinessBadge");
    const advice = $("readinessAdvice");
    const base = "rounded-xl p-4 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all";

    if (r.level === "high") {
        box.className = `${base} border-emerald-500/40 bg-emerald-500/10`;
        circle.className = "w-12 h-12 rounded-xl bg-emerald-500 text-zinc-950 flex items-center justify-center font-extrabold text-base shrink-0";
        title.textContent = "Estado Óptimo — Sobrecarga Progresiva Activa";
        title.className = "font-bold text-sm md:text-base text-emerald-300";
        badge.textContent = "+2.5% Carga / +1-2 Reps";
        badge.className = "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300";
        advice.textContent = "Alta disponibilidad neuromuscular. Se recomienda subir +2.5% en básicos o buscar el tope de repeticiones respetando el RIR de la semana.";
    } else if (r.level === "mid") {
        box.className = `${base} border-cyan-500/40 bg-cyan-500/10`;
        circle.className = "w-12 h-12 rounded-xl bg-cyan-500 text-zinc-950 flex items-center justify-center font-extrabold text-base shrink-0";
        title.textContent = "Estado Estable — Mantener Planificación";
        title.className = "font-bold text-sm md:text-base text-cyan-300";
        badge.textContent = "Carga Base Exacta";
        badge.className = "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300";
        advice.textContent = "Recuperación normal. Mantén los pesos programados para esta fase del mesociclo enfocándote en la calidad de cada pausa.";
    } else {
        box.className = `${base} border-amber-500/40 bg-amber-500/10`;
        circle.className = "w-12 h-12 rounded-xl bg-amber-500 text-zinc-950 flex items-center justify-center font-extrabold text-base shrink-0";
        title.textContent = "Fatiga Detectada — Autoregulación Protectora";
        title.className = "font-bold text-sm md:text-base text-amber-300";
        badge.textContent = "-8% Carga / +1 RIR";
        badge.className = "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300";
        advice.textContent = "Fatiga acumulada o bajo descanso. Reducimos ~8% la carga y dejamos 1 repetición extra en reserva para estimular sin sobreentrenar.";
    }
    circle.textContent = `${r.score}%`;

    if (save) {
        const prof = getCurrentProfile();
        const w = appState.selectedWeek, d = appState.selectedDay;
        if (!prof.readiness[w]) prof.readiness[w] = {};
        prof.readiness[w][d] = { mood, energy, freshness, potency, ...r };
        saveState();
        renderExercises(); // actualiza "Sugerido hoy"
    }
    return r;
}

function getSwap(ex, w = appState.selectedWeek, d = appState.selectedDay) {
    return getCurrentProfile().swaps?.[w]?.[d]?.[ex.id] || null;
}

// Ejercicio "visto" hoy (con reemplazo temporal aplicado si existe)
function viewEx(ex) {
    const s = getSwap(ex);
    return s ? { ...ex, name: s.name, baseWeight: s.baseWeight, cue: s.cue || ex.cue, addsBodyweight: s.addsBodyweight, swapped: true, originalName: ex.name } : ex;
}

function getSuggestedWeight(ex) {
    const prof = getCurrentProfile();
    const w = appState.selectedWeek;
    const rData = getReadinessData();
    if (!(ex.baseWeight > 0)) return 0;
    return roundToGymPlate(ex.baseWeight * MESOCYCLE_WEEKS[w].weightMult * rData.loadDeltaFactor, prof.unit);
}

function applyAutoregulationToSession() {
    const prof = getCurrentProfile();
    const w = appState.selectedWeek, d = appState.selectedDay;
    const rData = getReadinessData();
    prof.logs[w] = prof.logs[w] || {};
    prof.logs[w][d] = prof.logs[w][d] || {};

    prof.routine[d].exercises.forEach(rawEx => {
        const ex = viewEx(rawEx);
        const suggestedW = getSuggestedWeight(ex);
        const existing = prof.logs[w][d][ex.id] || [];
        const count = Math.max(existing.length, plannedSets(ex, w));
        prof.logs[w][d][ex.id] = Array.from({ length: count }, (_, idx) => {
            const prev = existing[idx];
            if (prev && prev.done) return prev; // no se tocan series completadas
            return {
                weight: suggestedW,
                reps: prev && prev.reps > 0 ? prev.reps : minReps(ex),
                rir: targetRir(w, rData.rirShift),
                done: false
            };
        });
    });
    saveState();
    renderExercises();
    showToast("Cargas y RIR ajustados dinámicamente según tu Readiness ⚡");
}

// ------------------------------------------
// Ejercicios y registro de series
// ------------------------------------------
function ensureExerciseLogs(ex) {
    const prof = getCurrentProfile();
    const w = appState.selectedWeek, d = appState.selectedDay;
    prof.logs[w] = prof.logs[w] || {};
    prof.logs[w][d] = prof.logs[w][d] || {};
    const arr = prof.logs[w][d][ex.id];
    // FIX v2: solo se crean si no existen (antes se recortaban y "+ Serie" no funcionaba)
    if (!Array.isArray(arr) || arr.length === 0) {
        const rShift = getReadinessData().rirShift || 0;
        prof.logs[w][d][ex.id] = Array.from({ length: plannedSets(ex, w) }, () => ({
            weight: getSuggestedWeight(ex),
            reps: minReps(ex),
            rir: targetRir(w, rShift),
            done: false
        }));
        saveState();
    }
    return prof.logs[w][d][ex.id];
}

// Última sesión guardada que contiene este ejercicio (excluye la sesión actual)
function lastPerformance(exId) {
    const prof = getCurrentProfile();
    const w = appState.selectedWeek, d = appState.selectedDay;
    for (const h of prof.history) {
        if (h.mesocycle === prof.mesocycle && h.week === w && h.day === d) continue;
        const sets = h.details?.[exId];
        if (Array.isArray(sets)) {
            const done = sets.filter(s => s.done);
            if (done.length) return { entry: h, sets: done };
        }
    }
    return null;
}

function categoryBadge(cat) {
    if (cat === "heavy") return `<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">Básico Pesado</span>`;
    if (cat === "moderate") return `<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400">Multiarticular</span>`;
    return `<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400">Aislamiento / Core</span>`;
}

function renderExercises() {
    const prof = getCurrentProfile();
    const w = appState.selectedWeek, d = appState.selectedDay;
    const dayObj = prof.routine[d];
    const container = $("exercisesContainer");
    const isCoach = appState.role === "coach";
    const u = esc(prof.unit);

    let totalSetsAll = 0, completedSetsAll = 0;
    const html = [];

    if (dayObj.exercises.length === 0) {
        html.push(`<div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center text-xs text-zinc-400">Este día no tiene ejercicios. Activa el <strong>Modo Entrenador</strong> para añadir uno.</div>`);
    }

    dayObj.exercises.forEach((rawEx, exIndex) => {
        const ex = viewEx(rawEx);
        const logs = ensureExerciseLogs(ex);
        const suggestedW = getSuggestedWeight(ex);
        const id = ex.id; // safeId garantiza [\w-]
        let best1RM = 0;
        logs.forEach(s => {
            totalSetsAll++;
            if (s.done) completedSetsAll++;
            const est = calculate1RM(effectiveLoad(ex, s.weight), s.reps);
            if (est > best1RM) best1RM = est;
        });
        const last = lastPerformance(id);
        const lastText = last ? last.sets.map(s => `${s.weight}×${s.reps}`).join(", ") : "";
        const doneCount = logs.filter(s => s.done).length;

        html.push(`
        <div class="exercise-card bg-zinc-900 border ${doneCount === logs.length && logs.length ? "border-emerald-500/40" : "border-zinc-800/90"} rounded-2xl p-4 md:p-5 shadow-lg transition hover:border-zinc-700/80" data-ex-id="${id}">
            <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-zinc-800/80">
                <div class="space-y-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="w-6 h-6 rounded-lg bg-zinc-800 text-zinc-300 font-bold text-xs flex items-center justify-center">${exIndex + 1}</span>
                        ${isCoach
                            ? `<input type="text" value="${esc(rawEx.name)}" aria-label="Nombre del ejercicio" onchange="updateExerciseField('${id}','name',this.value)" class="flex-1 min-w-[180px] bg-zinc-950 border border-cyan-500/40 rounded-lg px-2 py-1 font-bold text-white text-sm focus:outline-none">`
                            : `<h3 class="ex-name font-bold text-white text-base md:text-lg">${esc(ex.name)}</h3>`}
                        ${categoryBadge(ex.category)}
                        ${ex.swapped ? `<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300" title="Original: ${esc(ex.originalName)}">Reemplazo hoy</span>` : ""}
                    </div>
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400 pt-0.5">
                        <span>🎯 Meta: <strong class="text-zinc-200">${logs.length} × ${esc(ex.repsTarget)} reps</strong></span>
                        <span>⚡ Sugerido hoy: <strong class="text-emerald-400">${suggestedW > 0 ? `${suggestedW} ${u}` : "Peso corporal"}</strong>${ex.addsBodyweight ? ` <span class="text-zinc-500">(+ peso corporal)</span>` : ""}</span>
                        <span>⏱️ Pausa: <strong class="text-zinc-200">${ex.restSec}s</strong></span>
                        ${best1RM > 0 ? `<span>🏆 1RM Est: <strong class="text-cyan-400">${best1RM} ${u}</strong></span>` : ""}
                    </div>
                    ${lastText ? `<div class="text-[11px] text-zinc-500">📅 Última vez (S${last.entry.week}): <span class="text-zinc-300">${esc(lastText)} ${u}</span></div>` : ""}
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <button onclick="openTechniqueModal('${id}')" class="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition flex items-center gap-1" title="Ver técnica y errores comunes"><span>👁️</span><span>Técnica</span></button>
                    <button onclick="openReplaceModal('${id}')" class="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-cyan-300 transition flex items-center gap-1" title="Reemplazar por máquina equivalente"><span>🔄</span><span>Reemplazar</span></button>
                    ${ex.swapped ? `<button onclick="undoSwap('${id}')" class="px-2 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-amber-300" title="Volver al ejercicio original">↩️</button>` : ""}
                    ${isCoach ? `
                        <button onclick="moveExercise('${id}',-1)" class="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs" title="Subir" aria-label="Subir ejercicio">⬆️</button>
                        <button onclick="moveExercise('${id}',1)" class="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs" title="Bajar" aria-label="Bajar ejercicio">⬇️</button>
                        <button onclick="deleteExercise('${id}')" class="p-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 text-xs" title="Eliminar ejercicio" aria-label="Eliminar ejercicio">🗑️</button>` : ""}
                </div>
            </div>

            ${isCoach ? `
            <div class="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <label class="text-zinc-400">Series<input type="number" min="1" max="10" value="${rawEx.sets}" onchange="updateExerciseField('${id}','sets',this.value)" class="mt-0.5 w-full bg-zinc-950 border border-cyan-500/40 rounded-lg px-2 py-1 text-white"></label>
                <label class="text-zinc-400">Reps obj.<input type="text" value="${esc(rawEx.repsTarget)}" onchange="updateExerciseField('${id}','repsTarget',this.value)" class="mt-0.5 w-full bg-zinc-950 border border-cyan-500/40 rounded-lg px-2 py-1 text-white"></label>
                <label class="text-zinc-400">Peso base (${u})<input type="number" step="0.5" min="0" value="${rawEx.baseWeight}" onchange="updateExerciseField('${id}','baseWeight',this.value)" class="mt-0.5 w-full bg-zinc-950 border border-cyan-500/40 rounded-lg px-2 py-1 text-white"></label>
                <label class="text-zinc-400">Descanso (s)<input type="number" step="15" min="15" value="${rawEx.restSec}" onchange="updateExerciseField('${id}','restSec',this.value)" class="mt-0.5 w-full bg-zinc-950 border border-cyan-500/40 rounded-lg px-2 py-1 text-white"></label>
            </div>` : ""}

            <div class="mt-3 mb-3.5 bg-zinc-950/80 border-l-2 border-emerald-500 rounded-r-xl px-3 py-2 flex items-center justify-between gap-2">
                ${isCoach
                    ? `<input type="text" value="${esc(rawEx.cue)}" aria-label="Indicación técnica" onchange="updateExerciseField('${id}','cue',this.value)" class="w-full bg-transparent text-xs text-emerald-300 font-medium focus:outline-none">`
                    : `<p class="text-xs text-zinc-300"><strong class="text-emerald-400">Recordatorio:</strong> ${esc(ex.cue)}</p>`}
            </div>

            <div class="space-y-2">
                <div class="grid grid-cols-12 gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 px-2">
                    <div class="col-span-2 sm:col-span-1 text-center">Serie</div>
                    <div class="col-span-3 sm:col-span-3 text-center">Peso (${u})</div>
                    <div class="col-span-3 sm:col-span-3 text-center">Reps</div>
                    <div class="col-span-2 sm:col-span-3 text-center">RIR Real</div>
                    <div class="col-span-2 sm:col-span-2 text-center">Listo</div>
                </div>
                ${logs.map((s, sIdx) => `
                <div class="set-row grid grid-cols-12 gap-2 items-center p-1.5 rounded-xl border transition ${s.done ? "bg-emerald-500/10 border-emerald-500/30" : "bg-zinc-950/60 border-zinc-800/70"}">
                    <div class="col-span-2 sm:col-span-1 text-center font-bold text-xs ${s.done ? "text-emerald-400" : "text-zinc-400"}">#${sIdx + 1}</div>
                    <div class="col-span-3 sm:col-span-3">
                        <input type="number" inputmode="decimal" step="0.5" min="0" value="${s.weight}" aria-label="Peso serie ${sIdx + 1}"
                            onchange="updateSetLog('${id}', ${sIdx}, 'weight', this.value)"
                            class="set-weight w-full bg-zinc-900 border border-zinc-700/80 rounded-lg py-1.5 px-1 text-center text-xs md:text-sm font-bold text-white focus:outline-none focus:border-emerald-500">
                    </div>
                    <div class="col-span-3 sm:col-span-3">
                        <input type="number" inputmode="numeric" min="0" value="${s.reps}" aria-label="Repeticiones serie ${sIdx + 1}"
                            onchange="updateSetLog('${id}', ${sIdx}, 'reps', this.value)"
                            class="set-reps w-full bg-zinc-900 border border-zinc-700/80 rounded-lg py-1.5 px-1 text-center text-xs md:text-sm font-bold text-white focus:outline-none focus:border-emerald-500">
                    </div>
                    <div class="col-span-2 sm:col-span-3">
                        <input type="number" inputmode="decimal" min="0" max="5" step="0.5" value="${s.rir}" aria-label="RIR serie ${sIdx + 1}"
                            onchange="updateSetLog('${id}', ${sIdx}, 'rir', this.value)"
                            class="set-rir w-full bg-zinc-900 border border-zinc-700/80 rounded-lg py-1.5 px-1 text-center text-xs md:text-sm font-semibold text-cyan-300 focus:outline-none focus:border-cyan-500">
                    </div>
                    <div class="col-span-2 sm:col-span-2 flex justify-center">
                        <button onclick="toggleSetDone('${id}', ${sIdx})" aria-label="Marcar serie ${sIdx + 1} como completada" aria-pressed="${s.done}"
                            class="set-done w-9 h-9 rounded-xl font-bold text-sm flex items-center justify-center transition ${s.done ? "bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/30" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400"}">✓</button>
                    </div>
                </div>`).join("")}
            </div>

            <div class="mt-3 pt-2 border-t border-zinc-800/50 flex items-center justify-between text-xs">
                <div class="flex gap-2">
                    <button onclick="modifySetCount('${id}', 1)" class="add-set text-zinc-400 hover:text-emerald-400 font-semibold transition">+ Serie</button>
                    <span class="text-zinc-700">|</span>
                    <button onclick="modifySetCount('${id}', -1)" class="remove-set text-zinc-400 hover:text-rose-400 font-semibold transition">- Serie</button>
                </div>
                <button onclick="startRestTimerFor('${id}')" class="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1">
                    <span>⏱️ Descansar (${ex.restSec}s)</span>
                </button>
            </div>
        </div>`);
    });

    container.innerHTML = html.join("");
    $("sessionSummaryBadge").textContent = `${completedSetsAll}/${totalSetsAll} series completadas`;
    const pct = totalSetsAll ? Math.round(completedSetsAll / totalSetsAll * 100) : 0;
    $("sessionProgressBar").style.width = `${pct}%`;
    refreshSessionBadges();
}

function getRoutineEx(exId) {
    return getCurrentProfile().routine[appState.selectedDay].exercises.find(e => e.id === exId) || null;
}

function updateSetLog(exId, setIdx, field, value) {
    const prof = getCurrentProfile();
    const w = appState.selectedWeek, d = appState.selectedDay;
    const set = prof.logs[w]?.[d]?.[exId]?.[setIdx];
    if (!set) return;
    let v = num(value, 0);
    if (field === "weight") v = Math.max(0, v);
    if (field === "reps") v = Math.max(0, Math.round(v));
    if (field === "rir") v = clamp(v, 0, 10);
    set[field] = v;

    // Si cambia el peso de una serie no hecha, propaga a las siguientes series no hechas (ahorra escribir)
    if (field === "weight") {
        prof.logs[w][d][exId].forEach((s, i) => { if (i > setIdx && !s.done) s.weight = v; });
    }
    // En la Semana 1 la Serie 1 define el peso base (si no hay reemplazo temporal)
    const ex = getRoutineEx(exId);
    if (field === "weight" && w === 1 && setIdx === 0 && v > 0 && ex && !getSwap(ex)) {
        const rData = getReadinessData();
        ex.baseWeight = roundToGymPlate(v / rData.loadDeltaFactor, prof.unit);
    }
    saveState();
    renderExercises();
}

function toggleSetDone(exId, setIdx) {
    const prof = getCurrentProfile();
    const w = appState.selectedWeek, d = appState.selectedDay;
    const arr = prof.logs[w]?.[d]?.[exId];
    const setObj = arr?.[setIdx];
    if (!setObj) return;
    setObj.done = !setObj.done;
    saveState();
    renderExercises();

    if (setObj.done) {
        if (navigator.vibrate) navigator.vibrate(30);
        const rawEx = getRoutineEx(exId);
        if (!rawEx) return;
        const ex = viewEx(rawEx);
        const isLastSet = arr.every(s => s.done);
        const label = isLastSet ? `Transición tras ${ex.name}` : `Descanso ${ex.name} (Serie ${setIdx + 1})`;
        startRestTimer(ex.restSec, label);
    }
}

function modifySetCount(exId, delta) {
    const prof = getCurrentProfile();
    const w = appState.selectedWeek, d = appState.selectedDay;
    const arr = prof.logs[w]?.[d]?.[exId];
    if (!arr) return;
    if (delta > 0 && arr.length < 15) {
        const last = arr[arr.length - 1] || { weight: 20, reps: 10, rir: 2 };
        arr.push({ weight: last.weight, reps: last.reps, rir: last.rir, done: false });
    } else if (delta < 0 && arr.length > 1) {
        const last = arr[arr.length - 1];
        if (last.done && !confirm("La última serie ya está completada. ¿Eliminarla?")) return;
        arr.pop();
    }
    saveState();
    renderExercises();
}

function updateExerciseField(exId, field, value) {
    const prof = getCurrentProfile();
    const ex = getRoutineEx(exId);
    if (!ex) return;
    const w = appState.selectedWeek, d = appState.selectedDay;
    switch (field) {
        case "name": ex.name = str(value, 120).trim() || ex.name; break;
        case "cue": ex.cue = str(value, 400); break;
        case "repsTarget": ex.repsTarget = str(value, 20).trim() || ex.repsTarget; break;
        case "baseWeight": ex.baseWeight = Math.max(0, num(value, ex.baseWeight)); break;
        case "restSec": ex.restSec = clamp(int(value, ex.restSec), 15, 900); break;
        case "sets": {
            ex.sets = clamp(int(value, ex.sets), 1, 10);
            const arr = prof.logs[w]?.[d]?.[exId];
            if (arr) {
                const target = plannedSets(ex, w);
                while (arr.length < target) { const l = arr[arr.length - 1]; arr.push({ weight: l.weight, reps: l.reps, rir: l.rir, done: false }); }
                while (arr.length > target && !arr[arr.length - 1].done) arr.pop();
            }
            break;
        }
        default: return;
    }
    saveState();
    renderExercises();
    showToast("Ejercicio actualizado por Entrenador", "info");
}

function moveExercise(exId, dir) {
    const list = getCurrentProfile().routine[appState.selectedDay].exercises;
    const i = list.findIndex(e => e.id === exId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((e, k) => { e.order = k + 1; });
    saveState();
    renderExercises();
}

function deleteExercise(exId) {
    const prof = getCurrentProfile();
    const d = appState.selectedDay;
    const ex = getRoutineEx(exId);
    if (!ex || !confirm(`¿Eliminar "${ex.name}" del día? El historial guardado se conserva.`)) return;
    prof.routine[d].exercises = prof.routine[d].exercises.filter(e => e.id !== exId);
    saveState();
    renderExercises();
    showToast("Ejercicio eliminado del día");
}

function openAddExerciseModal() {
    const sel = $("newEx-pattern");
    if (!sel.options.length) {
        Object.entries(EXERCISE_ALTERNATIVES).forEach(([k, g]) => {
            const o = document.createElement("option");
            o.value = k; o.textContent = g.pattern;
            sel.appendChild(o);
        });
    }
    $("newEx-name").value = "";
    $("newEx-cue").value = "";
    openModal("addExerciseModal");
    $("newEx-name").focus();
}

function confirmAddExercise() {
    const name = $("newEx-name").value.trim();
    if (!name) { showToast("Escribe el nombre del ejercicio", "warn"); return; }
    const prof = getCurrentProfile();
    const d = appState.selectedDay;
    const category = CATEGORIES.includes($("newEx-category").value) ? $("newEx-category").value : "moderate";
    prof.routine[d].exercises.push({
        id: uid("custom"),
        order: prof.routine[d].exercises.length + 1,
        name: name.slice(0, 120),
        category,
        altKey: EXERCISE_ALTERNATIVES[$("newEx-pattern").value] ? $("newEx-pattern").value : "remo",
        sets: clamp(int($("newEx-sets").value, 3), 1, 10),
        repsTarget: $("newEx-reps").value.trim().slice(0, 20) || "10-12",
        baseWeight: Math.max(0, num($("newEx-weight").value, 20)),
        restSec: category === "heavy" ? prof.restHeavy : prof.restIso,
        addsBodyweight: false,
        cue: $("newEx-cue").value.trim().slice(0, 400) || "Control excéntrico y rango completo.",
        steps: "Ejecutar con control postural y respiración fluida.",
        commonError: "Usar impulso excesivo."
    });
    saveState();
    renderExercises();
    closeModal("addExerciseModal");
    showToast("Nuevo ejercicio añadido a la rutina");
}

// ------------------------------------------
// Temporizador de descanso (basado en reloj real: no se desfasa con pantalla bloqueada)
// ------------------------------------------
let timerState = { remaining: 120, total: 120, running: false, endAt: 0, intervalId: null };
let audioCtx = null;
let wakeLock = null;

function unlockAudio() {
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) { /* sin audio */ }
}

function playBeep() {
    try {
        unlockAudio();
        if (!audioCtx) return;
        [0, 0.35, 0.7].forEach((t, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(i === 2 ? 1320 : 880, audioCtx.currentTime + t);
            gain.gain.setValueAtTime(0.18, audioCtx.currentTime + t);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.3);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(audioCtx.currentTime + t); osc.stop(audioCtx.currentTime + t + 0.3);
        });
    } catch (e) { /* ignorado */ }
    if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
}

async function requestWakeLock() {
    try { if ("wakeLock" in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); } } catch (e) { /* no soportado */ }
}
function releaseWakeLock() { try { wakeLock && wakeLock.release(); } catch (e) { /* */ } wakeLock = null; }

function setTimerStatus(text, cls) {
    const l = $("timerStatusLabel");
    l.textContent = text;
    l.className = `hidden sm:inline-block text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${cls}`;
}

function startRestTimerFor(exId) {
    const ex = getRoutineEx(exId);
    if (ex) startRestTimer(ex.restSec, viewEx(ex).name);
}

function startRestTimer(seconds, hint = "Descanso entre series") {
    seconds = clamp(int(seconds, 90), 1, 3600);
    clearInterval(timerState.intervalId);
    timerState.total = seconds;
    timerState.remaining = seconds;
    timerState.endAt = Date.now() + seconds * 1000;
    timerState.running = true;
    $("timerExerciseHint").textContent = hint;
    setTimerStatus("Corriendo", "bg-emerald-500/20 text-emerald-400");
    $("timerPlayPauseBtn").textContent = "Pausar";
    $("floatingTimer").classList.add("timer-active");
    requestWakeLock();
    updateTimerDisplay();
    timerState.intervalId = setInterval(timerTick, 250);
}

function timerTick() {
    if (!timerState.running) return;
    timerState.remaining = Math.max(0, Math.ceil((timerState.endAt - Date.now()) / 1000));
    updateTimerDisplay();
    if (timerState.remaining <= 0) finishTimer();
}

function finishTimer() {
    clearInterval(timerState.intervalId);
    timerState.running = false;
    setTimerStatus("¡A levantar!", "bg-cyan-500/20 text-cyan-300");
    $("timerPlayPauseBtn").textContent = "Iniciar";
    $("floatingTimer").classList.remove("timer-active");
    releaseWakeLock();
    playBeep();
    showToast("⏱️ ¡Tiempo de descanso terminado! Siguiente serie.", "info");
}

function toggleTimerPause() {
    if (timerState.running) {
        timerTick();
        clearInterval(timerState.intervalId);
        timerState.running = false;
        setTimerStatus("Pausado", "bg-zinc-800 text-zinc-400");
        $("timerPlayPauseBtn").textContent = "Reanudar";
        $("floatingTimer").classList.remove("timer-active");
        releaseWakeLock();
    } else {
        const total = timerState.total;
        const rem = timerState.remaining > 0 ? timerState.remaining : total;
        startRestTimer(rem, $("timerExerciseHint").textContent);
        timerState.total = Math.max(total, rem);
        updateTimerDisplay();
    }
}

function adjustTimer(delta) {
    if (timerState.running) {
        timerState.endAt = Math.max(Date.now(), timerState.endAt + delta * 1000);
        timerTick();
    } else {
        timerState.remaining = Math.max(0, timerState.remaining + delta);
    }
    if (timerState.remaining > timerState.total) timerState.total = timerState.remaining;
    updateTimerDisplay();
}

function resetTimer() {
    clearInterval(timerState.intervalId);
    timerState.running = false;
    timerState.remaining = timerState.total;
    setTimerStatus("Listo", "bg-zinc-800 text-zinc-400");
    $("timerPlayPauseBtn").textContent = "Iniciar";
    $("floatingTimer").classList.remove("timer-active");
    releaseWakeLock();
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const mins = Math.floor(timerState.remaining / 60).toString().padStart(2, "0");
    const secs = (timerState.remaining % 60).toString().padStart(2, "0");
    $("timerDisplay").textContent = `${mins}:${secs}`;
    const pct = timerState.total > 0 ? (timerState.remaining / timerState.total) * 100 : 0;
    $("timerProgressBar").style.width = `${pct}%`;
    if (timerState.running) document.title = `⏱️ ${mins}:${secs} · Seba FitPro`;
    else document.title = "Seba FitPro | Periodización & Autoregulación";
}

// ------------------------------------------
// Reemplazo de ejercicios y técnica
// ------------------------------------------
let activeReplaceExId = null;
let activeReplaceOptions = [];

function openReplaceModal(exId) {
    const prof = getCurrentProfile();
    const rawEx = getRoutineEx(exId);
    if (!rawEx) return;
    const ex = viewEx(rawEx);
    activeReplaceExId = exId;
    const altGroup = EXERCISE_ALTERNATIVES[ex.altKey] || EXERCISE_ALTERNATIVES.remo;
    $("replaceModalTitle").textContent = `Reemplazar: ${ex.name}`;
    $("replaceModalPattern").textContent = `Patrón Biomecánico: ${altGroup.pattern}`;
    $("replacePermanentCheck").checked = false;

    // Para dominadas lastradas la carga real es peso corporal + lastre
    const refLoad = rawEx.addsBodyweight ? prof.bodyweight + rawEx.baseWeight : rawEx.baseWeight;
    activeReplaceOptions = altGroup.options
        .filter(opt => opt.name !== ex.name)
        .map(opt => ({ ...opt, estWeight: opt.factor === 0 ? 0 : roundToGymPlate(refLoad * opt.factor, prof.unit) }));

    $("alternativesList").innerHTML = activeReplaceOptions.map((opt, idx) => `
        <div class="bg-zinc-950 border border-zinc-800 hover:border-cyan-500/50 rounded-xl p-3.5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="space-y-1">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-white text-sm">${esc(opt.name)}</span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">Efectividad ${esc(opt.eff)}</span>
                </div>
                <p class="text-xs text-zinc-400">${esc(opt.note)}</p>
                <span class="text-[11px] text-cyan-400 font-semibold block">Carga equivalente estimada: ${opt.estWeight > 0 ? `${opt.estWeight} ${esc(prof.unit)}` : "Peso corporal"}</span>
            </div>
            <button onclick="applyReplacement(${idx})" class="shrink-0 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs transition">Seleccionar</button>
        </div>`).join("") || `<p class="text-xs text-zinc-400">No hay alternativas para este patrón.</p>`;
    openModal("replaceModal");
}

function applyReplacement(idx) {
    const opt = activeReplaceOptions[idx];
    const prof = getCurrentProfile();
    const w = appState.selectedWeek, d = appState.selectedDay;
    const ex = getRoutineEx(activeReplaceExId);
    if (!ex || !opt) return;
    const isPermanent = $("replacePermanentCheck").checked;

    if (isPermanent) {
        // FIX v2: ahora la casilla realmente distingue permanente vs. solo hoy
        ex.name = opt.name;
        ex.baseWeight = opt.estWeight;
        ex.cue = opt.note;
        ex.addsBodyweight = false;
        if (prof.swaps[w]?.[d]) delete prof.swaps[w][d][ex.id];
    } else {
        prof.swaps[w] = prof.swaps[w] || {};
        prof.swaps[w][d] = prof.swaps[w][d] || {};
        prof.swaps[w][d][ex.id] = { name: opt.name, baseWeight: opt.estWeight, cue: opt.note, addsBodyweight: false };
    }
    const v = viewEx(ex);
    (prof.logs[w]?.[d]?.[ex.id] || []).forEach(s => { if (!s.done) s.weight = getSuggestedWeight(v); });
    saveState();
    renderExercises();
    closeModal("replaceModal");
    showToast(isPermanent ? `Rutina actualizada permanentemente a ${opt.name}` : `Reemplazo solo para esta sesión: ${opt.name}`, "info");
}

function undoSwap(exId) {
    const prof = getCurrentProfile();
    const w = appState.selectedWeek, d = appState.selectedDay;
    if (prof.swaps[w]?.[d]?.[exId]) delete prof.swaps[w][d][exId];
    const ex = getRoutineEx(exId);
    if (ex) (prof.logs[w]?.[d]?.[exId] || []).forEach(s => { if (!s.done) s.weight = getSuggestedWeight(ex); });
    saveState();
    renderExercises();
    showToast("Ejercicio original restaurado", "info");
}

function openTechniqueModal(exId) {
    const rawEx = getRoutineEx(exId);
    if (!rawEx) return;
    const ex = viewEx(rawEx);
    $("techModalTitle").textContent = ex.name;
    $("techModalCue").textContent = ex.cue;
    $("techModalSteps").innerText = ex.swapped ? "Mantén postura neutra, control excéntrico y rango completo." : (ex.steps || "Mantén postura neutra y control en todo el recorrido.");
    $("techModalError").textContent = ex.swapped ? "Usar impulso o acortar el rango de recorrido." : (ex.commonError || "Usar impulso o acortar el rango de recorrido.");
    const q = encodeURIComponent(`${ex.name} técnica`);
    $("techVideoLink").href = `https://www.youtube.com/results?search_query=${q}`;
    openModal("techniqueModal");
}

// ------------------------------------------
// Check-out, PRs y guardado de sesión
// ------------------------------------------
function bestHistorical1RM(exId, ex, excludeId = null) {
    let best = 0;
    getCurrentProfile().history.forEach(h => {
        if (h.id === excludeId) return;
        (h.details?.[exId] || []).forEach(s => {
            if (!s.done) return;
            const est = calculate1RM(effectiveLoad(ex, s.weight), s.reps);
            if (est > best) best = est;
        });
    });
    return best;
}

function computeSessionMetrics(w = appState.selectedWeek, d = appState.selectedDay, excludeId = null) {
    const prof = getCurrentProfile();
    let tonnage = 0, setsDone = 0, setsTotal = 0, prsCount = 0;
    const prList = [];
    prof.routine[d].exercises.forEach(rawEx => {
        const ex = { ...viewEx(rawEx) };
        const logs = prof.logs[w]?.[d]?.[ex.id] || [];
        let bestToday = 0;
        logs.forEach(s => {
            setsTotal++;
            if (!s.done) return;
            setsDone++;
            tonnage += effectiveLoad(ex, s.weight) * s.reps;
            const est = calculate1RM(effectiveLoad(ex, s.weight), s.reps);
            if (est > bestToday) bestToday = est;
        });
        if (ex.swapped || bestToday <= 0) return;
        const prev = bestHistorical1RM(ex.id, ex, excludeId);
        const baseline = prev > 0 ? prev : calculate1RM(effectiveLoad(ex, ex.baseWeight), minReps(ex));
        if (baseline > 0 && bestToday > baseline) { prsCount++; prList.push(`${ex.name} (${bestToday} ${prof.unit})`); }
    });
    return { tonnage: Math.round(tonnage), setsDone, setsTotal, prsCount, prList };
}

function openCheckoutModal() {
    const prof = getCurrentProfile();
    const existing = findSavedSession(prof, appState.selectedWeek, appState.selectedDay);
    const metrics = computeSessionMetrics(undefined, undefined, existing?.id);
    $("co-tonnage").textContent = `${metrics.tonnage.toLocaleString("es-CL")} ${prof.unit}`;
    $("co-sets").textContent = `${metrics.setsDone}/${metrics.setsTotal}`;
    $("co-prs").textContent = metrics.prsCount;
    $("co-prlist").textContent = metrics.prList.length ? "🏆 " + metrics.prList.join(" · ") : "";
    $("co-existing").classList.toggle("hidden", !existing);
    if (existing) {
        $("co-rpe").value = existing.rpe;
        $("co-pump").value = existing.pump || "Moderado / Bueno";
        $("co-pain").value = existing.pain || "Ninguna (0/10)";
        $("co-notes").value = existing.notes;
    }
    $("co-rpe-val").textContent = `${$("co-rpe").value} / 10`;
    openModal("checkoutModal");
}

function nextSession(w, d) {
    if (d < 4) return { w, d: d + 1 };
    if (w < 4) return { w: w + 1, d: 1 };
    return null;
}

function saveWorkoutSession(alsoCopyForAI) {
    const prof = getCurrentProfile();
    const w = appState.selectedWeek, d = appState.selectedDay;
    const existingIdx = prof.history.findIndex(h => h.mesocycle === prof.mesocycle && h.week === w && h.day === d);
    const existing = existingIdx >= 0 ? prof.history[existingIdx] : null;
    const metrics = computeSessionMetrics(w, d, existing?.id);

    if (metrics.setsDone === 0 && !confirm("No marcaste ninguna serie como completada (✓). ¿Guardar igualmente?")) return;
    if (existing && !confirm(`Ya guardaste la sesión Semana ${w} · Día ${d} de este mesociclo. ¿Actualizar ese registro?`)) return;

    const rData = getReadinessData(w, d);
    const now = new Date();
    const details = deepClone(prof.logs[w]?.[d] || {});
    const exNames = {};
    prof.routine[d].exercises.forEach(e => { exNames[e.id] = viewEx(e).name; });

    const entry = {
        id: existing ? existing.id : uid("sess"),
        date: now.toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        isoDate: now.toISOString(),
        mesocycle: prof.mesocycle,
        week: w, day: d,
        dayTitle: prof.routine[d].title,
        tonnage: metrics.tonnage,
        setsDone: metrics.setsDone,
        setsTotal: metrics.setsTotal,
        prs: metrics.prsCount,
        readinessScore: rData.score,
        rpe: clamp(int($("co-rpe").value, 8), 1, 10),
        pump: str($("co-pump").value, 60),
        pain: str($("co-pain").value, 60),
        notes: $("co-notes").value.trim().slice(0, 2000),
        coachFeedback: existing ? existing.coachFeedback : "",
        details, exNames
    };

    if (existing) prof.history[existingIdx] = entry;
    else prof.history.unshift(entry);
    saveState();
    closeModal("checkoutModal");
    $("co-notes").value = "";

    if (alsoCopyForAI) copyAIReport(entry);
    else showToast(metrics.prsCount ? `🏁 ¡Sesión guardada con ${metrics.prsCount} récord(s) personal(es)! 🏆` : "🏁 ¡Sesión guardada en tu historial con éxito!");

    // Avanza automáticamente a la siguiente sesión del mesociclo
    const nx = nextSession(w, d);
    if (nx && !existing) {
        setTimeout(() => {
            selectWeek(nx.w, false);
            selectDay(nx.d, false);
            loadReadinessForCurrentSession();
            renderExercises();
            window.scrollTo({ top: 0, behavior: "smooth" });
            showToast(`➡️ Siguiente: Semana ${nx.w} · ${prof.routine[nx.d].short || "Día " + nx.d}`, "info");
        }, 600);
    } else if (!nx) {
        renderExercises();
        setTimeout(() => showToast("🎉 ¡Mesociclo completo! Ve a Progreso → 'Iniciar Nuevo Mesociclo' para progresar cargas.", "info"), 800);
    } else {
        renderExercises();
    }
}

// Nuevo mesociclo: recalcula pesos base a partir del rendimiento real (1RM ajustado por RIR)
function startNewMesocycle() {
    const prof = getCurrentProfile();
    if (!confirm(`¿Iniciar el Mesociclo #${prof.mesocycle + 1}?\n\n• Se recalculan los pesos base según tu rendimiento real (máx. ±5%).\n• Se limpian las series de las 4 semanas (el historial guardado se conserva).`)) return;
    let up = 0, down = 0;
    Object.entries(prof.routine).forEach(([dNum, dObj]) => {
        dObj.exercises.forEach(ex => {
            let best = 0;
            for (let w = 1; w <= 3; w++) {
                (prof.logs[w]?.[dNum]?.[ex.id] || []).forEach(s => {
                    if (!s.done) return;
                    const est = calculate1RM(effectiveLoad(ex, s.weight), s.reps, s.rir);
                    if (est > best) best = est;
                });
            }
            if (best <= 0 || ex.baseWeight <= 0) return;
            // Carga que deja RIR ~2.5 al mínimo de reps del rango
            let newLoad = best / (1 + (minReps(ex) + 2.5) / 30);
            if (ex.addsBodyweight) newLoad -= prof.bodyweight;
            const lo = ex.baseWeight * 0.95, hi = ex.baseWeight * 1.05;
            let nb = roundToGymPlate(clamp(newLoad, lo, hi), prof.unit);
            // Asegurar al menos un salto mínimo si el rendimiento lo justifica
            if (newLoad > ex.baseWeight && nb <= ex.baseWeight) nb = ex.baseWeight + (prof.unit === "lb" ? 1 : 0.5);
            if (nb > ex.baseWeight) up++; else if (nb < ex.baseWeight) down++;
            ex.baseWeight = Math.max(0, nb);
        });
    });
    prof.mesocycle += 1;
    prof.logs = {};
    prof.readiness = {};
    prof.swaps = {};
    saveState();
    selectWeek(1, false);
    selectDay(1, false);
    loadReadinessForCurrentSession();
    renderExercises();
    refreshActiveView();
    showToast(`🔁 Mesociclo #${prof.mesocycle} iniciado: ${up} ejercicio(s) suben, ${down} bajan.`);
}

// ------------------------------------------
// Analíticas y gráficos
// ------------------------------------------
let oneRmChartInstance = null;
let tonnageChartInstance = null;

function populateChartExerciseSelect() {
    const prof = getCurrentProfile();
    const sel = $("chartExerciseSelect");
    const currentVal = sel.value;
    sel.innerHTML = "";
    Object.entries(prof.routine).forEach(([dayNum, dayObj]) => {
        dayObj.exercises.forEach(ex => {
            const opt = document.createElement("option");
            opt.value = `${dayNum}|${ex.id}`;
            opt.textContent = `D${dayNum}: ${ex.name}`;
            sel.appendChild(opt);
        });
    });
    if (currentVal && [...sel.options].some(o => o.value === currentVal)) sel.value = currentVal;
}

function renderAnalytics() {
    const prof = getCurrentProfile();
    const metrics = computeSessionMetrics();
    const u = esc(prof.unit);
    $("kpi-tonnage").textContent = `${metrics.tonnage.toLocaleString("es-CL")} ${prof.unit}`;
    $("kpi-sessions").textContent = prof.history.length;

    if (prof.history.length > 0) {
        const recent = prof.history.slice(0, 8);
        const avgR = Math.round(recent.reduce((acc, h) => acc + (h.readinessScore || 80), 0) / recent.length);
        $("kpi-readiness").textContent = `${avgR}%`;
    } else {
        $("kpi-readiness").textContent = `${getReadinessData().score}%`;
    }

    // KPI 1RM del primer básico del Día 1
    const keyEx = prof.routine[1]?.exercises.find(e => e.category === "heavy") || prof.routine[1]?.exercises[0];
    if (keyEx) {
        $("kpi-key-label").textContent = `1RM Est. ${keyEx.name}`;
        let best = calculate1RM(effectiveLoad(keyEx, keyEx.baseWeight), minReps(keyEx));
        for (let w = 1; w <= 4; w++) (prof.logs[w]?.[1]?.[keyEx.id] || []).forEach(s => { if (s.done) best = Math.max(best, calculate1RM(effectiveLoad(keyEx, s.weight), s.reps)); });
        best = Math.max(best, bestHistorical1RM(keyEx.id, keyEx));
        $("kpi-bench1rm").textContent = `${best} ${prof.unit}`;
    } else {
        $("kpi-key-label").textContent = "1RM Est.";
        $("kpi-bench1rm").textContent = "--";
    }

    const rows = [];
    Object.entries(prof.routine).forEach(([dNum, dObj]) => {
        dObj.exercises.forEach(ex => {
            let bestSetText = `Base: ${ex.baseWeight} ${u} × ${esc(ex.repsTarget)}`;
            let best1RM = calculate1RM(effectiveLoad(ex, ex.baseWeight), minReps(ex));
            for (let w = 1; w <= 4; w++) {
                (prof.logs[w]?.[dNum]?.[ex.id] || []).forEach(s => {
                    if (!s.done) return;
                    const est = calculate1RM(effectiveLoad(ex, s.weight), s.reps);
                    if (est >= best1RM) { best1RM = est; bestSetText = `${s.weight} ${u} × ${s.reps} reps (S${w})`; }
                });
            }
            const hist = bestHistorical1RM(ex.id, ex);
            if (hist > best1RM) { best1RM = hist; bestSetText = "Récord en historial"; }
            const nextSug = ex.baseWeight > 0 ? `${roundToGymPlate(ex.baseWeight * 1.025, prof.unit)} ${u}` : "Control técnico";
            rows.push(`
                <tr class="hover:bg-zinc-800/40">
                    <td class="py-2.5 px-3 font-bold text-cyan-400 whitespace-nowrap">Día ${dNum}</td>
                    <td class="py-2.5 px-3 font-medium text-white">${esc(ex.name)}</td>
                    <td class="py-2.5 px-3 text-zinc-300">${bestSetText}</td>
                    <td class="py-2.5 px-3 font-extrabold text-emerald-400 whitespace-nowrap">${best1RM > 0 ? `${best1RM} ${u}` : "Peso corp."}</td>
                    <td class="py-2.5 px-3 text-zinc-400 whitespace-nowrap">${nextSug}</td>
                </tr>`);
        });
    });
    $("oneRmTableBody").innerHTML = rows.join("");
    renderCharts();
}

function chartAvailable() {
    const ok = typeof window.Chart !== "undefined";
    document.querySelectorAll(".chart-fallback").forEach(el => el.classList.toggle("hidden", ok));
    return ok;
}

function renderCharts() {
    if (!chartAvailable()) return;
    const prof = getCurrentProfile();
    const selVal = $("chartExerciseSelect").value || `1|${prof.routine[1].exercises[0]?.id || ""}`;
    const [dayNum, exId] = selVal.split("|");
    const ex = prof.routine[dayNum]?.exercises.find(e => e.id === exId);

    // 1RM: sesiones guardadas (cronológico) + sesión actual sin guardar; si no hay datos, proyección de las 4 semanas
    let labels = [], data = [];
    if (ex) {
        const points = [...prof.history].reverse().map(h => {
            let m = 0;
            (h.details?.[exId] || []).forEach(s => { if (s.done) m = Math.max(m, calculate1RM(effectiveLoad(ex, s.weight), s.reps)); });
            return m > 0 ? { label: `M${h.mesocycle} S${h.week}`, v: m } : null;
        }).filter(Boolean);
        if (points.length) {
            labels = points.map(p => p.label);
            data = points.map(p => p.v);
        } else {
            labels = ["S1 (Acum)", "S2 (Int)", "S3 (Pico)", "S4 (Desc)"];
            data = [1, 2, 3, 4].map(w => {
                let m = 0;
                (prof.logs[w]?.[dayNum]?.[exId] || []).forEach(s => { m = Math.max(m, calculate1RM(effectiveLoad(ex, s.weight), s.reps)); });
                return m || calculate1RM(effectiveLoad(ex, roundToGymPlate(ex.baseWeight * MESOCYCLE_WEEKS[w].weightMult, prof.unit)), minReps(ex));
            });
        }
    }
    const axis = (grid = true) => ({ ticks: { color: "#71717a", font: { size: 10 } }, grid: grid ? { color: "#27272a" } : { display: false } });

    if (oneRmChartInstance) oneRmChartInstance.destroy();
    oneRmChartInstance = new Chart($("oneRmChart").getContext("2d"), {
        type: "line",
        data: { labels, datasets: [{ label: `1RM Estimado (${prof.unit})`, data, borderColor: "#10b981", backgroundColor: "rgba(16, 185, 129, 0.15)", borderWidth: 3, tension: 0.35, fill: true, pointBackgroundColor: "#10b981", pointRadius: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#a1a1aa", font: { size: 11 } } } }, scales: { x: axis(), y: axis() } }
    });

    const w = appState.selectedWeek;
    const dayLabels = [1, 2, 3, 4].map(d => `D${d}: ${prof.routine[d].short || ""}`);
    const tonnageData = [1, 2, 3, 4].map(d => {
        let sum = 0, anyDone = false;
        prof.routine[d].exercises.forEach(item => {
            (prof.logs[w]?.[d]?.[item.id] || []).forEach(s => { if (s.done) { anyDone = true; sum += effectiveLoad(item, s.weight) * s.reps; } });
        });
        if (!anyDone) prof.routine[d].exercises.forEach(item => { sum += effectiveLoad(item, item.baseWeight * MESOCYCLE_WEEKS[w].weightMult) * minReps(item) * plannedSets(item, w); });
        return Math.round(sum);
    });
    if (tonnageChartInstance) tonnageChartInstance.destroy();
    tonnageChartInstance = new Chart($("tonnageChart").getContext("2d"), {
        type: "bar",
        data: { labels: dayLabels, datasets: [{ label: `Tonelaje S${w} — real si hay series ✓, si no planificado (${prof.unit})`, data: tonnageData, backgroundColor: ["#10b981", "#06b6d4", "#10b981", "#06b6d4"], borderRadius: 8 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#a1a1aa", font: { size: 11 } } } }, scales: { x: axis(false), y: axis() } }
    });
}

// ------------------------------------------
// Historial y feedback del entrenador
// ------------------------------------------
function renderHistory() {
    const prof = getCurrentProfile();
    const container = $("historyListContainer");
    const isCoach = appState.role === "coach";
    const u = esc(prof.unit);

    if (prof.history.length === 0) {
        container.innerHTML = `
            <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-2">
                <span class="text-3xl block">📭</span>
                <h3 class="font-bold text-white text-base">Aún no hay sesiones finalizadas</h3>
                <p class="text-xs text-zinc-400 max-w-md mx-auto">Completa tus series en la pestaña Entrenamiento y presiona "Finalizar Rutina & Check-out" para registrar tu progreso aquí.</p>
            </div>`;
        return;
    }

    container.innerHTML = prof.history.map(h => {
        const detailRows = Object.entries(h.details || {}).map(([exId, sets]) => {
            const done = sets.filter(s => s.done);
            if (!done.length) return "";
            const name = h.exNames?.[exId] || prof.routine[h.day]?.exercises.find(e => e.id === exId)?.name || exId;
            return `<li><span class="text-zinc-200">${esc(name)}:</span> ${done.map(s => `${s.weight}×${s.reps} <span class="text-zinc-500">(RIR ${s.rir})</span>`).join(", ")}</li>`;
        }).join("");
        return `
        <div class="history-item bg-zinc-900 border border-zinc-800 rounded-2xl p-4 md:p-5 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                <div>
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">M${h.mesocycle} · Semana ${h.week}</span>
                        <h3 class="font-bold text-white text-sm md:text-base">${esc(h.dayTitle)}</h3>
                        ${h.prs ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300">🏆 ${h.prs} PR</span>` : ""}
                    </div>
                    <span class="text-[11px] text-zinc-400">${esc(h.date)}</span>
                </div>
                <div class="flex items-center gap-2 text-xs flex-wrap">
                    <span class="bg-zinc-950 px-2.5 py-1 rounded-lg border border-zinc-800">Readiness: <strong class="text-emerald-400">${h.readinessScore}%</strong></span>
                    <span class="bg-zinc-950 px-2.5 py-1 rounded-lg border border-zinc-800">Tonelaje: <strong class="text-white">${h.tonnage.toLocaleString("es-CL")} ${u}</strong></span>
                    <span class="bg-zinc-950 px-2.5 py-1 rounded-lg border border-zinc-800">RPE: <strong class="text-cyan-400">${h.rpe}/10</strong></span>
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-zinc-300">
                <div><strong>Series:</strong> ${h.setsDone}/${h.setsTotal} completadas</div>
                <div><strong>Bombeo:</strong> ${esc(h.pump)}</div>
                <div><strong>Molestia articular:</strong> ${esc(h.pain)}</div>
            </div>
            ${detailRows ? `<details class="text-xs"><summary class="cursor-pointer text-zinc-400 hover:text-zinc-200 font-semibold">Ver series registradas</summary><ul class="mt-2 space-y-1 text-zinc-400 pl-2">${detailRows}</ul></details>` : ""}
            ${h.notes ? `<p class="text-xs bg-zinc-950 p-3 rounded-xl border border-zinc-800 text-zinc-300 whitespace-pre-line"><strong>Notas del Atleta:</strong> ${esc(h.notes)}</p>` : ""}
            <div class="bg-cyan-950/20 border border-cyan-500/30 rounded-xl p-3 space-y-1.5">
                <span class="text-[11px] font-bold text-cyan-400 block">👨‍🏫 Feedback del Entrenador:</span>
                ${isCoach
                    ? `<textarea rows="2" placeholder="Escribe recomendaciones técnicas o ajustes de carga para la próxima semana..." onchange="saveCoachFeedback('${h.id}', this.value)" class="w-full bg-zinc-950 border border-cyan-500/40 rounded-lg p-2 text-xs text-white focus:outline-none">${esc(h.coachFeedback)}</textarea>`
                    : `<p class="text-xs text-zinc-300 whitespace-pre-line">${esc(h.coachFeedback) || "Sin comentarios adicionales del entrenador aún."}</p>`}
            </div>
            <div class="flex justify-end gap-3 text-[11px]">
                <button onclick="copyHistoryEntry('${h.id}')" class="text-emerald-400 hover:text-emerald-300 font-semibold">📋 Copiar reporte</button>
                <button onclick="deleteHistoryEntry('${h.id}')" class="text-zinc-500 hover:text-rose-400 font-semibold">🗑️ Eliminar</button>
            </div>
        </div>`;
    }).join("");
}

function saveCoachFeedback(historyId, text) {
    const h = getCurrentProfile().history.find(x => x.id === historyId);
    if (!h) return;
    h.coachFeedback = str(text, 2000);
    saveState();
    showToast("Feedback del entrenador guardado", "info");
}

function deleteHistoryEntry(historyId) {
    const prof = getCurrentProfile();
    if (!confirm("¿Eliminar esta sesión del historial?")) return;
    prof.history = prof.history.filter(h => h.id !== historyId);
    saveState();
    renderHistory();
    refreshSessionBadges();
    showToast("Sesión eliminada", "info");
}

// ------------------------------------------
// Exportar / Sincronizar (IA, CSV, JSON, respaldo)
// ------------------------------------------
async function copyText(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* fallback */ }
    try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed"; ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    } catch (e) { return false; }
}

function openSyncModal() {
    $("syncJsonBox").value = JSON.stringify(getCurrentProfile());
    $("lastBackupText").textContent = appState.lastBackupAt
        ? `Último respaldo: ${new Date(appState.lastBackupAt).toLocaleDateString("es-CL")}`
        : "Aún no has descargado un respaldo.";
    $("shareReportBtn").classList.toggle("hidden", !navigator.share);
    openModal("syncModal");
}

function buildSessionReport(entry) {
    const prof = getCurrentProfile();
    const w = entry ? entry.week : appState.selectedWeek;
    const d = entry ? entry.day : appState.selectedDay;
    const dayObj = prof.routine[d];
    const rData = getReadinessData(w, d);
    const r = entry ? { score: entry.readinessScore } : rData;
    const metrics = entry ? entry : computeSessionMetrics(w, d);
    const sets = entry ? entry.details : (prof.logs[w]?.[d] || {});

    let report = `### 📊 REPORTE DE ENTRENAMIENTO (${prof.name.toUpperCase()})\n`;
    report += `- **Mesociclo:** #${entry ? entry.mesocycle : prof.mesocycle} | **Fase:** ${MESOCYCLE_WEEKS[w].name} (RIR Objetivo: ${MESOCYCLE_WEEKS[w].rir})\n`;
    report += `- **Sesión:** ${entry ? entry.dayTitle : dayObj.title}${entry ? ` (${entry.date})` : ""}\n`;
    report += `- **Peso corporal:** ${prof.bodyweight} ${prof.unit}\n`;
    report += `- **Check-in Inicial (Readiness):** ${r.score}%${entry ? "" : ` (Ánimo: ${rData.mood}/5, Energía: ${rData.energy}/5, Frescura: ${rData.freshness}/5, Velocidad: ${rData.potency}/5)`}\n`;
    report += `- **Tonelaje Total:** ${metrics.tonnage} ${prof.unit} | **Series:** ${metrics.setsDone}/${metrics.setsTotal}\n\n`;
    report += `#### 🏋️ Detalle por Ejercicio:\n`;
    const ids = Object.keys(sets);
    const ordered = dayObj.exercises.map(e => e.id).filter(id => ids.includes(id)).concat(ids.filter(id => !dayObj.exercises.some(e => e.id === id)));
    ordered.forEach((exId, i) => {
        const ex = dayObj.exercises.find(e => e.id === exId);
        const name = entry?.exNames?.[exId] || (ex ? viewEx(ex).name : exId);
        const setsStr = (sets[exId] || []).map((s, idx) => `S${idx + 1}: ${s.weight}${prof.unit}x${s.reps} (RIR ${s.rir})${s.done ? "✓" : ""}`).join(" | ");
        report += `${i + 1}. **${name}**${ex ? ` [Meta: ${ex.repsTarget}]` : ""}: ${setsStr}\n`;
    });
    if (entry) {
        report += `\n#### 🏁 Check-out Post-Entreno:\n`;
        report += `- **RPE Final:** ${entry.rpe}/10 | **Bombeo:** ${entry.pump} | **Molestias:** ${entry.pain} | **PRs:** ${entry.prs}\n`;
        if (entry.notes) report += `- **Notas:** ${entry.notes}\n`;
        if (entry.coachFeedback) report += `- **Feedback Entrenador:** ${entry.coachFeedback}\n`;
    }
    report += `\n> *Coach IA: Analiza mi rendimiento, fatiga y RIR real de hoy para sugerirme los ajustes de carga/volumen de la próxima sesión.*`;
    return report;
}

async function copyAIReport(specificSession = null) {
    const entry = specificSession && specificSession.id ? specificSession : null;
    const ok = await copyText(buildSessionReport(entry));
    showToast(ok ? "🤖 Reporte copiado. ¡Pégalo en el chat para que la IA lo analice!" : "⚠️ No se pudo copiar automáticamente.", ok ? "success" : "warn");
}

function copyHistoryEntry(historyId) {
    const h = getCurrentProfile().history.find(x => x.id === historyId);
    if (h) copyAIReport(h);
}

async function copyFullHistoryReport() {
    const prof = getCurrentProfile();
    if (!prof.history.length) { showToast("Aún no hay sesiones en el historial", "warn"); return; }
    let report = `## 📚 HISTORIAL COMPLETO — ${prof.name.toUpperCase()} (${prof.history.length} sesiones)\n`;
    report += `Peso corporal: ${prof.bodyweight} ${prof.unit} | Mesociclo actual: #${prof.mesocycle}\n\n`;
    [...prof.history].reverse().forEach(h => {
        report += `### ${h.date} — M${h.mesocycle} S${h.week} · ${h.dayTitle}\n`;
        report += `Readiness ${h.readinessScore}% | RPE ${h.rpe}/10 | Tonelaje ${h.tonnage} ${prof.unit} | Series ${h.setsDone}/${h.setsTotal} | PRs ${h.prs} | Molestias: ${h.pain}\n`;
        Object.entries(h.details).forEach(([exId, sets]) => {
            const done = sets.filter(s => s.done);
            if (!done.length) return;
            const name = h.exNames?.[exId] || exId;
            report += `- ${name}: ${done.map(s => `${s.weight}x${s.reps}@RIR${s.rir}`).join(", ")}\n`;
        });
        if (h.notes) report += `- Notas: ${h.notes}\n`;
        if (h.coachFeedback) report += `- Coach: ${h.coachFeedback}\n`;
        report += `\n`;
    });
    report += `> *Coach IA: Analiza mi tendencia de fuerza, fatiga y adherencia en todo el historial y propón ajustes para el próximo mesociclo.*`;
    const ok = await copyText(report);
    showToast(ok ? "📚 Historial completo copiado para la IA" : "⚠️ No se pudo copiar automáticamente.", ok ? "success" : "warn");
}

async function shareReport() {
    try {
        await navigator.share({ title: "Reporte Seba FitPro", text: buildSessionReport(null) });
    } catch (e) { if (e && e.name !== "AbortError") copyAIReport(); }
}

function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(v) {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s; // evita inyección de fórmulas en Excel
    return `"${s.replace(/"/g, '""')}"`;
}

function fileSafe(name) { return String(name).replace(/[^\w\-]+/g, "_").slice(0, 40) || "atleta"; }

function exportCSV() {
    const prof = getCurrentProfile();
    const rows = [["Dia", "Orden", "Ejercicio", "Series", "Reps_Objetivo", `Carga_Base_${prof.unit}`, "S1_Acumulacion", "S2_Intensificacion", "S3_Pico", "S4_Descarga", "Indicacion_Tecnica"]];
    Object.entries(prof.routine).forEach(([dNum, dObj]) => {
        dObj.exercises.forEach((ex, idx) => {
            const weekStr = (w) => {
                const logs = prof.logs[w]?.[dNum]?.[ex.id] || [];
                const done = logs.filter(s => s.done);
                return done.map(s => `${s.weight}${prof.unit}x${s.reps}(RIR ${s.rir})`).join(" / ");
            };
            rows.push([dObj.title, idx + 1, ex.name, ex.sets, ex.repsTarget, ex.baseWeight, weekStr(1), weekStr(2), weekStr(3), weekStr(4), ex.cue]);
        });
    });
    const csv = "﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n"); // BOM: acentos correctos en Excel
    downloadFile(`Rutina_Periodizacion_${fileSafe(prof.name)}.csv`, csv, "text/csv;charset=utf-8");
    showToast("📊 Archivo CSV descargado (compatible con Excel / Google Sheets)");
}

function exportHistoryCSV() {
    const prof = getCurrentProfile();
    const rows = [["Fecha", "Mesociclo", "Semana", "Dia", "Ejercicio", "Serie", `Peso_${prof.unit}`, "Reps", "RIR", "Completada", "Readiness", "RPE", "Notas"]];
    [...prof.history].reverse().forEach(h => {
        Object.entries(h.details).forEach(([exId, sets]) => {
            sets.forEach((s, i) => rows.push([h.isoDate ? h.isoDate.slice(0, 10) : h.date, h.mesocycle, h.week, h.day, h.exNames?.[exId] || exId, i + 1, s.weight, s.reps, s.rir, s.done ? "Si" : "No", h.readinessScore, h.rpe, h.notes]));
        });
    });
    const csv = "﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n");
    downloadFile(`Historial_${fileSafe(prof.name)}.csv`, csv, "text/csv;charset=utf-8");
    showToast("📊 Historial completo descargado en CSV");
}

async function copySyncCode() {
    const ok = await copyText($("syncJsonBox").value);
    showToast(ok ? "Código JSON copiado para enviar a tu entrenador" : "⚠️ No se pudo copiar. Selecciona el texto manualmente.", ok ? "info" : "warn");
}

function importProfileData(parsed) {
    const prof = normalizeProfile(parsed, uid("ath"));
    const exists = appState.profiles[prof.id];
    if (exists && !confirm(`Ya existe el perfil "${exists.name}". ¿Reemplazarlo con los datos importados?`)) return false;
    appState.profiles[prof.id] = prof;
    appState.currentProfileId = prof.id;
    return prof;
}

function afterImport(msg) {
    saveState();
    renderProfileSelector();
    updateRoleUI();
    selectWeek(appState.selectedWeek, false);
    selectDay(appState.selectedDay, false);
    loadReadinessForCurrentSession();
    renderExercises();
    refreshActiveView();
    closeModal("syncModal");
    closeModal("onboardingModal");
    showToast(msg);
}

function importSyncCode() {
    const raw = $("syncJsonBox").value.trim();
    if (!raw) { showToast("⚠️ Pega primero un código JSON.", "warn"); return; }
    try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.profiles) { restoreFullBackup(parsed); return; }
        if (!parsed || !parsed.id || !parsed.routine) throw new Error("Formato inválido");
        const prof = importProfileData(parsed);
        if (!prof) return;
        afterImport(`✅ Datos sincronizados para ${prof.name}`);
    } catch (e) {
        showToast("⚠️ Código JSON inválido. Verifica que esté completo.", "warn");
    }
}

function downloadBackup() {
    appState.lastBackupAt = new Date().toISOString();
    saveState();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`SebaFitPro_respaldo_${stamp}.json`, JSON.stringify({ app: "seba-fitpro", version: APP_VERSION, exportedAt: appState.lastBackupAt, ...appState }, null, 1), "application/json");
    $("lastBackupText").textContent = `Último respaldo: ${new Date().toLocaleDateString("es-CL")}`;
    showToast("💾 Respaldo completo descargado. Guárdalo en Drive o envíatelo por correo.");
}

function restoreFullBackup(parsed) {
    if (!confirm("Restaurar este respaldo REEMPLAZARÁ todos los datos actuales de esta app. ¿Continuar?")) return;
    appState = normalizeState(parsed);
    appState.onboarded = true;
    afterImport("✅ Respaldo restaurado correctamente");
}

function triggerRestoreFile() { $("restoreFileInput").click(); }

function handleRestoreFile(input) {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { showToast("⚠️ Archivo demasiado grande", "warn"); return; }
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(String(reader.result));
            if (parsed && parsed.profiles) restoreFullBackup(parsed);
            else if (parsed && parsed.id && parsed.routine) { const p = importProfileData(parsed); if (p) afterImport(`✅ Perfil ${p.name} importado`); }
            else throw new Error("formato");
        } catch (e) {
            showToast("⚠️ El archivo no es un respaldo válido de Seba FitPro.", "warn");
        }
    };
    reader.readAsText(file);
}

function checkBackupReminder() {
    const prof = getCurrentProfile();
    if (prof.history.length < 3) return;
    const last = appState.lastBackupAt ? new Date(appState.lastBackupAt).getTime() : 0;
    if (Date.now() - last > 14 * 24 * 3600 * 1000) {
        setTimeout(() => showToast("💾 Recordatorio: descarga un respaldo en 'Sync IA / Coach' para no perder tu progreso.", "info"), 1500);
    }
}

function resetAllData() {
    if (!confirm("¿Borrar TODOS los datos de la app en este dispositivo? Descarga un respaldo antes si quieres conservarlos.")) return;
    if (!confirm("Última confirmación: esta acción no se puede deshacer.")) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* */ }
    appState = defaultState();
    location.reload();
}

document.addEventListener("DOMContentLoaded", init);
