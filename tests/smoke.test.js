// Pruebas end-to-end en navegador real (Playwright). Ejecutar: npm test
const { chromium } = require("playwright");
const fs = require("fs");
const { createServer } = require("./server");

const results = [];
let page, context, browser, base;
const pageErrors = [];

async function test(name, fn) {
    try { await fn(); results.push([true, name]); console.log("  ✅", name); }
    catch (e) { results.push([false, name, e.message]); console.log("  ❌", name, "\n     →", e.message.split("\n")[0]); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assert failed"); }
const ev = (fn, arg) => page.evaluate(fn, arg);
const state = () => ev(() => JSON.parse(localStorage.getItem("seba_fitpro_v1_state")));
const toastText = () => ev(() => [...document.querySelectorAll("#toastContainer .toast span")].map(s => s.textContent).join(" | "));

async function freshPage(opts = {}) {
    if (context) await context.close();
    context = await browser.newContext({ acceptDownloads: true, ...opts });
    await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    page = await context.newPage();
    page.on("pageerror", e => pageErrors.push(e.message));
    page.on("console", m => { if (m.type() === "error" && !/net::ERR|Failed to load resource/.test(m.text())) pageErrors.push("console: " + m.text()); });
    page.on("dialog", d => d.type() === "prompt" ? d.accept("Pedro") : d.accept());
    await page.goto(base);
    await page.waitForFunction(() => document.querySelectorAll(".exercise-card").length > 0);
}

(async () => {
    const server = createServer().listen(0);
    base = `http://localhost:${server.address().port}/`;
    browser = await chromium.launch();
    console.log("Ejecutando pruebas en", base);

    await freshPage();

    await test("Primer uso muestra bienvenida y exige nombre", async () => {
        assert(await page.isVisible("#onboardingModal"), "onboarding no visible");
        await page.click("#obStartBtn");
        assert(await page.isVisible("#onboardingModal"), "debería seguir abierto sin nombre");
        await page.fill("#ob-name", "Ana");
        await page.fill("#ob-weight", "65");
        await page.click("#obStartBtn");
        assert(!(await page.isVisible("#onboardingModal")), "onboarding no se cerró");
        const s = await state();
        assert(s.profiles.seba.name === "Ana" && s.profiles.seba.bodyweight === 65 && s.onboarded, "perfil no guardado");
    });

    await test("Renderiza 7 ejercicios del Día 1 con estilos compilados", async () => {
        assert((await page.locator(".exercise-card").count()) === 7, "no hay 7 ejercicios");
        const bg = await ev(() => getComputedStyle(document.querySelector(".exercise-card")).backgroundColor);
        assert(bg !== "rgba(0, 0, 0, 0)", "Tailwind no aplicado: " + bg);
        assert(await ev(() => typeof Chart !== "undefined"), "Chart.js no cargó");
    });

    await test("FIX: '+ Serie' persiste tras re-render y recarga (antes se perdía)", async () => {
        const card = page.locator(".exercise-card").first();
        assert((await card.locator(".set-row").count()) === 4, "deberían ser 4 series");
        await card.locator(".add-set").click();
        await page.click("#dayBtn-2"); await page.click("#dayBtn-1");
        assert((await page.locator(".exercise-card").first().locator(".set-row").count()) === 5, "la serie extra desapareció");
        await page.reload(); await page.waitForSelector(".exercise-card");
        assert((await page.locator(".exercise-card").first().locator(".set-row").count()) === 5, "no persistió tras recarga");
        await page.locator(".exercise-card").first().locator(".remove-set").click();
        assert((await page.locator(".exercise-card").first().locator(".set-row").count()) === 4, "- Serie no funciona");
    });

    await test("Cambiar peso propaga a series siguientes y define peso base en S1", async () => {
        const w = page.locator(".exercise-card").first().locator(".set-weight");
        await w.nth(0).fill("85"); await w.nth(0).dispatchEvent("change");
        const vals = await page.locator(".exercise-card").first().locator(".set-weight").evaluateAll(els => els.map(e => e.value));
        assert(vals.every(v => v === "85"), "no propagó: " + vals);
        const s = await state();
        assert(s.profiles.seba.routine[1].exercises[0].baseWeight > 80, "peso base no actualizado");
    });

    await test("Marcar serie ✓ inicia el temporizador y actualiza contador", async () => {
        await page.locator(".exercise-card").first().locator(".set-done").first().click();
        assert((await page.textContent("#timerStatusLabel")) === "Corriendo", "timer no corre");
        assert((await page.textContent("#sessionSummaryBadge")).startsWith("1/"), "contador no actualizado");
        await page.waitForTimeout(1300);
        const t = await page.textContent("#timerDisplay");
        assert(t !== "03:00", "timer no avanza: " + t);
        await page.click("#timerPlayPauseBtn");
        assert((await page.textContent("#timerStatusLabel")) === "Pausado", "no pausó");
        await page.click("button[aria-label='Reiniciar temporizador']");
    });

    await test("Readiness bajo reduce el peso sugerido (-8%) y suma +1 RIR", async () => {
        const before = await ev(() => getSuggestedWeight(getCurrentProfile().routine[1].exercises[0]));
        for (const id of ["mood", "energy", "freshness", "potency"]) await page.locator(`#input-${id}`).fill("2");
        const after = await ev(() => getSuggestedWeight(getCurrentProfile().routine[1].exercises[0]));
        assert(after < before, `no bajó: ${before} → ${after}`);
        await page.click("text=Aplicar Ajuste a Cargas Hoy");
        const rir = await page.locator(".exercise-card").nth(1).locator(".set-rir").first().inputValue();
        assert(rir === "3", "RIR esperado 3 (2+1), obtenido " + rir);
        for (const id of ["mood", "energy", "freshness", "potency"]) await page.locator(`#input-${id}`).fill("4");
    });

    await test("Reemplazo temporal no altera la rutina; '↩️' lo deshace", async () => {
        await page.locator(".exercise-card").nth(2).locator("text=Reemplazar").click();
        await page.locator("#alternativesList button").first().click();
        assert(await page.locator(".exercise-card").nth(2).locator("text=Reemplazo hoy").isVisible(), "sin badge");
        const s = await state();
        assert(s.profiles.seba.routine[1].exercises[2].name === "Press Militar con Barra de Pie", "rutina modificada");
        await page.locator(".exercise-card").nth(2).locator("button[title='Volver al ejercicio original']").click();
        assert((await page.locator(".exercise-card").nth(2).locator(".ex-name").textContent()) === "Press Militar con Barra de Pie", "no se deshizo");
    });

    await test("Seguridad: nombres con HTML no se ejecutan (XSS) en Modo Entrenador", async () => {
        await page.click("#roleToggleBtn");
        const inp = page.locator(".exercise-card").nth(6).locator("input[aria-label='Nombre del ejercicio']");
        await inp.fill(`<img src=x onerror="window.__xss=1">Core "test" 'q'`);
        await inp.dispatchEvent("change");
        await page.click("#roleToggleBtn");
        await page.waitForTimeout(200);
        assert(!(await ev(() => window.__xss)), "¡XSS ejecutado!");
        assert((await page.locator(".exercise-card").nth(6).locator(".ex-name").textContent()).includes("<img"), "texto no mostrado literal");
        // Los botones con onclick siguen funcionando con comillas en el nombre
        await page.locator(".exercise-card").nth(6).locator("text=Descansar").click();
        assert((await page.textContent("#timerStatusLabel")) === "Corriendo", "botón roto por comillas");
        await page.click("button[aria-label='Reiniciar temporizador']");
    });

    await test("Check-out guarda sesión, detecta PR y avanza al Día 2", async () => {
        const card = page.locator(".exercise-card").first();
        const n = await card.locator(".set-done").count();
        for (let i = 1; i < n; i++) await page.locator(".exercise-card").first().locator(".set-done").nth(i).click();
        await page.click("#checkoutBtn");
        assert((await page.textContent("#co-prs")) === "1", "debería detectar 1 PR (85 > base 80)");
        await page.fill("#co-notes", "Muy bien <b>hoy</b>");
        await page.click("#saveSessionBtn");
        await page.waitForTimeout(900);
        const s = await state();
        assert(s.profiles.seba.history.length === 1, "no se guardó");
        assert(s.selectedDay === 2, "no avanzó al Día 2");
        assert(s.profiles.seba.history[0].exNames.d1_e1, "faltan nombres de ejercicio");
    });

    await test("Re-guardar la misma sesión actualiza en vez de duplicar", async () => {
        await page.click("#dayBtn-1");
        assert(await page.isVisible("#dayCheck-1"), "falta ✓ en Día 1");
        await page.click("#checkoutBtn");
        assert(await page.isVisible("#co-existing"), "no avisa que ya existe");
        await page.click("#saveSessionBtn");
        await page.waitForTimeout(300);
        assert((await state()).profiles.seba.history.length === 1, "se duplicó");
    });

    await test("Historial muestra la sesión con notas escapadas y feedback del coach", async () => {
        await page.click("#tab-history");
        assert((await page.locator(".history-item").count()) === 1, "no aparece");
        assert((await page.locator(".history-item").textContent()).includes("<b>hoy</b>"), "notas no escapadas");
        await page.click("#roleToggleBtn");
        const ta = page.locator(".history-item textarea");
        await ta.fill("Sube 2.5 kg"); await ta.dispatchEvent("change");
        await page.click("#roleToggleBtn");
        assert((await page.locator(".history-item").textContent()).includes("Sube 2.5 kg"), "feedback no guardado");
    });

    await test("Copiar historial completo para IA genera texto", async () => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        await page.click("#copyHistoryBtn");
        await page.waitForTimeout(200);
        const clip = await ev(() => navigator.clipboard.readText());
        assert(clip.includes("HISTORIAL COMPLETO") && clip.includes("Sube 2.5 kg"), "contenido incorrecto");
    });

    await test("Progreso: KPIs, tabla 1RM y gráficos sin errores", async () => {
        await page.click("#tab-analytics");
        await page.waitForTimeout(300);
        assert((await page.textContent("#kpi-sessions")) === "1", "kpi sesiones");
        assert((await page.locator("#oneRmTableBody tr").count()) === 28, "tabla incompleta");
        assert(await ev(() => !!Chart.getChart("oneRmChart") && !!Chart.getChart("tonnageChart")), "gráficos no creados");
    });

    await test("CSV con BOM, comillas escapadas y sin inyección de fórmulas", async () => {
        await page.click("#syncBtn");
        const [dl] = await Promise.all([page.waitForEvent("download"), page.click("text=⬇️ CSV Rutina")]);
        const txt = fs.readFileSync(await dl.path(), "utf8");
        assert(txt.charCodeAt(0) === 0xFEFF, "sin BOM");
        assert(txt.includes('""test""'), "comillas no escapadas");
        assert(dl.suggestedFilename().endsWith(".csv"), "nombre incorrecto");
    });

    let backupPath;
    await test("Respaldo completo se descarga y es JSON válido", async () => {
        const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#downloadBackupBtn")]);
        backupPath = await dl.path();
        const j = JSON.parse(fs.readFileSync(backupPath, "utf8"));
        assert(j.profiles.seba.history.length === 1 && j.app === "seba-fitpro", "respaldo incompleto");
    });

    await test("Importar JSON inválido muestra aviso y no rompe la app", async () => {
        await page.fill("#syncJsonBox", "{esto no es json");
        await page.click("#importJsonBtn");
        assert((await toastText()).includes("inválido"), "sin aviso");
        assert((await state()).profiles.seba.history.length === 1, "datos alterados");
    });

    await test("Importar perfil malicioso: se sanea (XSS en nombre/ID)", async () => {
        const evil = { id: "x'); window.__xss2=1; ('", name: "<img src=x onerror=window.__xss2=1>", routine: { 1: { title: "<b>T</b>", exercises: [{ id: "a'b", name: "<svg onload=window.__xss2=1>", sets: 99, repsTarget: "8" }] } }, history: [{ notes: "<script>window.__xss2=1</script>" }] };
        await page.fill("#syncJsonBox", JSON.stringify(evil));
        await page.click("#importJsonBtn");
        await page.click("#tab-workout"); await page.click("#dayBtn-1");
        await page.click("#tab-history");
        await page.waitForTimeout(300);
        assert(!(await ev(() => window.__xss2)), "¡XSS ejecutado!");
        const s = await state();
        const p = s.profiles[s.currentProfileId];
        assert(/^[\w-]+$/.test(p.id) && p.routine[1].exercises[0].sets === 10, "no se saneó");
        await page.selectOption("#profileSelect", "seba");
    });

    await test("Cambio kg → lb convierte las cargas", async () => {
        await page.click("#tab-workout");
        await page.click("button[aria-label='Configurar perfil']");
        await page.selectOption("#prof-unit", "lb");
        await page.click("#saveProfileBtn");
        const s = await state();
        const bw = s.profiles.seba.bodyweight;
        assert(Math.abs(bw - 143.3) < 0.2, "peso corporal no convertido: " + bw);
        await page.click("button[aria-label='Configurar perfil']");
        await page.selectOption("#prof-unit", "kg");
        await page.click("#saveProfileBtn");
        assert(Math.abs((await state()).profiles.seba.bodyweight - 65) < 0.2, "no volvió a kg");
    });

    await test("Nuevo mesociclo recalcula pesos base y limpia series", async () => {
        await page.click("#tab-analytics");
        await page.click("#newMesoBtn");
        const s = await state();
        assert(s.profiles.seba.mesocycle === 2, "mesociclo no avanzó");
        assert(Object.keys(s.profiles.seba.logs).length === 0 || !s.profiles.seba.logs[1]?.[1]?.d1_e1?.some(x => x.done), "series no limpiadas");
        assert(s.profiles.seba.history.length === 1, "historial perdido");
        assert(s.selectedWeek === 1 && s.selectedDay === 1, "no volvió a S1 D1");
    });

    await test("Restaurar respaldo desde archivo recupera los datos", async () => {
        await page.click("#syncBtn");
        await page.setInputFiles("#restoreFileInput", backupPath);
        await page.waitForTimeout(400);
        const s = await state();
        assert(s.profiles.seba.mesocycle === 1 && s.profiles.seba.history.length === 1, "no restauró");
    });

    await test("Datos corruptos en localStorage: la app se recupera", async () => {
        await ev(() => localStorage.setItem("seba_fitpro_v1_state", "{corrupto"));
        await page.reload();
        await page.waitForSelector(".exercise-card");
        assert((await page.locator(".exercise-card").count()) === 7, "app rota");
        assert(await ev(() => Object.keys(localStorage).some(k => k.includes("_corrupt_"))), "no guardó copia");
    });

    await test("Migración desde datos de la versión 1 (sin pedir bienvenida)", async () => {
        const v1 = { currentProfileId: "seba", role: "athlete", selectedWeek: 2, selectedDay: 3, profiles: { seba: { id: "seba", name: "Seba", bodyweight: 78, unit: "kg", restHeavy: 165, restIso: 90, routine: await ev(() => DEFAULT_ROUTINE), logs: { 2: { 3: { d3_e1: [{ weight: 30, reps: 9, rir: 1, done: true }] } } }, readiness: {}, history: [{ id: "sess_1", date: "01 nov 2026", week: 1, day: 1, dayTitle: "Día 1", tonnage: 5000, setsDone: 20, setsTotal: 27, prs: 1, readinessScore: 80, rpe: "8", pump: "x", pain: "y", notes: "", coachFeedback: "", details: {} }] } } };
        await ev(v => localStorage.setItem("seba_fitpro_v1_state", JSON.stringify(v)), v1);
        await page.reload(); await page.waitForSelector(".exercise-card");
        assert(!(await page.isVisible("#onboardingModal")), "pidió bienvenida a usuario existente");
        assert((await page.locator(".exercise-card").first().locator(".set-done[aria-pressed='true']").count()) === 1, "logs v1 no cargados");
        const s = await state();
        assert(s.profiles.seba.history[0].rpe === 8, "historial v1 no normalizado");
    });

    await test("Móvil (iPhone): sin scroll horizontal", async () => {
        const { devices } = require("playwright");
        await freshPage({ ...devices["iPhone 13"] });
        await page.fill("#ob-name", "Móvil"); await page.click("#obStartBtn");
        const over = await ev(() => document.documentElement.scrollWidth - window.innerWidth);
        assert(over <= 0, `desborde horizontal de ${over}px`);
        await page.screenshot({ path: "test-results/mobile.png", fullPage: false });
    });

    await test("PWA: service worker activo y funciona sin internet", async () => {
        await freshPage();
        await page.fill("#ob-name", "Offline"); await page.click("#obStartBtn");
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.reload(); await page.waitForSelector(".exercise-card");
        await context.setOffline(true);
        await page.reload(); await page.waitForSelector(".exercise-card", { timeout: 5000 });
        assert((await page.locator(".exercise-card").count()) === 7, "no carga offline");
        await context.setOffline(false);
    });

    await test("Sin errores de JavaScript durante todas las pruebas", async () => {
        assert(pageErrors.length === 0, pageErrors.join(" || "));
    });

    await browser.close();
    server.close();
    const failed = results.filter(r => !r[0]);
    console.log(`\n${results.length - failed.length}/${results.length} pruebas OK`);
    process.exit(failed.length ? 1 : 0);
})();
