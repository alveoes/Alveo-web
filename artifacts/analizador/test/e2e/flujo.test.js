import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { iniciarMock } from "./mock-apis.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const PUERTO = 8191;
const BASE = `http://127.0.0.1:${PUERTO}/analiza-tu-negocio/`;
const DIR = mkdtempSync(join(tmpdir(), "alveo-e2e-"));
const AUDIT = join(DIR, "analisis.jsonl");
let mock, app, browser;

before(async () => {
  mock = await iniciarMock();
  app = spawn(process.execPath, ["src/server.js"], {
    env: { ...process.env, NODE_ENV: "test", PORT: String(PUERTO), GOOGLE_PLACES_API_KEY: "clave-test", TEST_GOOGLE_BASE_URL: mock.url,
      META_IG_USER_ID: "IG_TEST", META_ACCESS_TOKEN: "token-test", TEST_META_BASE_URL: mock.url, AUDIT_LOG_FILE: AUDIT, RATE_LIMIT_10MIN: "50" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((r) => app.stdout.once("data", r));
  browser = await chromium.launch({ args: ["--no-proxy-server"] });
});
after(async () => { await browser?.close(); app?.kill(); mock?.srv.close(); });

async function pagina(movil = false) {
  const ctx = await browser.newContext(movil ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
  const p = await ctx.newPage();
  const errores = [];
  p.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  p.on("pageerror", (e) => errores.push(String(e)));
  await p.goto(BASE);
  await p.waitForSelector("#municipio option[value='Granada']", { state: "attached" });
  return { p, errores };
}

async function datosBasicos(p, sector = "restauracion") {
  await p.fill("#negocio", "Taberna Ficticia");
  await p.selectOption("#municipio", "Granada");
  await p.selectOption("#sector", sector);
}

test("formulario: exige al menos un enlace y valida dominios", async () => {
  const { p, errores } = await pagina();
  await p.click("#boton-analizar");
  assert.match(await p.textContent("#err-negocio"), /nombre/);
  await datosBasicos(p);
  await p.click("#boton-analizar");
  assert.match(await p.textContent("#error-general"), /al menos un enlace/);
  await p.fill("#enlace-instagram", "https://evil.com/instagram.com/x");
  await p.click("#boton-analizar");
  assert.equal(await p.isVisible("#err-instagram"), true);
  assert.equal(await p.getAttribute("#enlace-instagram", "aria-invalid"), "true");
  // «Otro» muestra el campo adicional
  await p.selectOption("#sector", "otro");
  assert.equal(await p.isVisible("#sectorOtro"), true);
  // «No tengo este perfil» desactiva el campo
  await p.check("[data-sin-perfil='instagram']");
  assert.equal(await p.isDisabled("#enlace-instagram"), true);
  // TikTok no aparece en la página pública
  assert.equal(await p.$("[data-plataforma='tiktok']"), null);
  assert.ok(!(await p.textContent("body")).includes("TikTok"));
  // instrucciones desplegables
  await p.click("[data-plataforma='google'] summary");
  assert.equal(await p.isVisible("[data-plataforma='google'] details ol"), true);
  assert.deepEqual(errores, []);
});

test("flujo completo: progreso, resultados, datos ausentes y WhatsApp", async () => {
  const { p, errores } = await pagina(true);
  await datosBasicos(p);
  await p.fill("#enlace-google", "https://www.google.com/maps/place/Taberna+Ficticia/@37.17,-3.59,17z/data=!4m6!3m5!1s0xd71fc:0x" + (1234567890).toString(16));
  await p.fill("#enlace-instagram", "@taberna_ficticia");
  await p.click("#boton-analizar");
  await p.waitForSelector("#resultados:not([hidden])", { timeout: 15000 });

  const tarjetas = await p.$$eval("#tarjetas article", (as) => as.map((a) => a.innerText));
  assert.equal(tarjetas.length, 2);
  assert.match(tarjetas[0], /Google[\s\S]*Puntuación sobre 100[\s\S]*Cobertura parcial · 6 de 7[\s\S]*Respuestas del propietario\s*Datos insuficientes/);
  assert.match(tarjetas[0], /Taberna Ficticia de Prueba · C\. Inventada, 12/);
  assert.match(tarjetas[1], /Instagram[\s\S]*Puntuación sobre 100[\s\S]*Cobertura completa/);
  assert.match(await p.textContent("#meta-analisis"), /Fecha del análisis: \d+ de noviembre de 2026/);
  assert.match(await p.textContent(".aclaracion"), /No representan un porcentaje de ventas ni garantizan resultados comerciales/);
  const meter = await p.getAttribute("#tarjetas article:first-child .puntuacion + .medidor", "aria-valuenow");
  assert.ok(Number(meter) > 0);

  const href = await p.getAttribute("#boton-whatsapp", "href");
  const texto = new URL(href).searchParams.get("text");
  assert.ok(href.startsWith("https://wa.me/34642018865?text="));
  assert.match(texto, /^Hola, soy de Taberna Ficticia, en Granada\. He utilizado el analizador de ALVEO y me gustaría saber cómo mejorar mis puntuaciones\. Mis puntuaciones: Google \d+\/100, Instagram \d+\/100\.$/);
  assert.equal(await p.getAttribute("#boton-whatsapp", "target"), "_blank");
  await p.screenshot({ path: "test/e2e/captura-resultados-movil.png", fullPage: true });

  const pasos = mock.llamadas.map((l) => `${l.metodo} ${l.ruta}`);
  assert.ok(pasos.includes("POST /v1/places:searchText") && pasos.includes("GET /v1/places/ChIJ_TEST_completo_0001"));
  // registro interno con rúbrica, evidencias y fecha
  const reg = readFileSync(AUDIT, "utf8").trim().split("\n").map((l) => JSON.parse(l)).at(-1);
  assert.equal(reg.rubrica, "2026.11-v1");
  assert.ok(reg.resultados.find((r) => r.plataforma === "google").criterios.length === 7);
  assert.equal(reg.resultados.find((r) => r.plataforma === "google").metodoIdentificacion, "identificador de ficha (CID) verificado");
  assert.ok(!JSON.stringify(reg).includes("texto que no se guarda"));
  assert.deepEqual(errores, []);
});

test("caché: un segundo análisis reutiliza los datos sin llamar a la API", async () => {
  const antes = mock.llamadas.length;
  const { p } = await pagina();
  await datosBasicos(p);
  await p.fill("#enlace-instagram", "https://www.instagram.com/taberna_ficticia/");
  await p.check("[data-sin-perfil='google']");
  await p.click("#boton-analizar");
  await p.waitForSelector("#resultados:not([hidden])");
  assert.equal(mock.llamadas.length, antes, "sin llamadas nuevas");
  const t = await p.$$eval("#tarjetas article", (as) => as.map((a) => a.innerText));
  assert.match(t[0], /Google\s*No incluido[\s\S]*No resta puntos/);
  assert.match(t[1], /Datos consultados el/);
});

test("cuenta de Instagram personal: «No se ha podido analizar» con motivo, sin cero", async () => {
  const { p } = await pagina();
  await datosBasicos(p);
  await p.fill("#enlace-instagram", "@cuenta_personal");
  await p.click("#boton-analizar");
  await p.waitForSelector("#resultados:not([hidden])");
  const t = await p.$$eval("#tarjetas article", (as) => as.map((a) => a.innerText));
  assert.match(t[1], /Instagram\s*No se ha podido analizar\s*Instagram solo permite consultar cuentas profesionales/);
  const texto = new URL(await p.getAttribute("#boton-whatsapp", "href")).searchParams.get("text");
  assert.ok(!texto.includes("Mis puntuaciones"), "sin puntuaciones inventadas en el mensaje");
});

test("API: rechaza peticiones de otro origen y cuerpos no JSON", async () => {
  const r1 = await fetch(`${BASE}api/analizar`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.com" }, body: "{}" });
  assert.equal(r1.status, 403);
  const r2 = await fetch(`${BASE}api/analizar`, { method: "POST", headers: { "content-type": "text/plain" }, body: "x" });
  assert.equal(r2.status, 415);
  const r3 = await fetch(`${BASE}..%2F..%2Fsrc%2Fconfig.js`);
  assert.equal(r3.status, 404);
  const r4 = await fetch(BASE);
  assert.match(r4.headers.get("content-security-policy"), /script-src 'self'/);
});
