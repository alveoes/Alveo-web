// Pruebas del analizador con HTML de ejemplo (no son análisis de webs reales).
// Ejecutar: pnpm --filter @workspace/api-server run test
import { build } from "esbuild";
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = await mkdtemp(path.join(os.tmpdir(), "alveo-test-"));
const out = path.join(tmp, "mods.mjs");
await build({
  stdin: {
    contents: `export { analyzePage } from "./src/lib/html-analysis.ts"; export { isPublicIp, normalizeUserUrl } from "./src/lib/safe-fetch.ts";`,
    resolveDir: path.resolve(here, ".."),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  logLevel: "error",
  // pino y sus transportes no hacen falta en estas pruebas
  external: ["pino", "pino-pretty"],
});
const { analyzePage, isPublicIp, normalizeUserUrl } = await import(out);
process.on("exit", () => rm(tmp, { recursive: true, force: true }));

const noPsi = { available: false, reason: "not_configured", message: "sin clave" };
const page = (html, extra = {}) => ({
  requestedUrl: "https://ejemplo.es/",
  finalUrl: "https://ejemplo.es/",
  status: 200,
  headers: { "content-encoding": "gzip" },
  html,
  responseTimeMs: 300,
  transferBytes: 4000,
  htmlBytes: Buffer.byteLength(html),
  redirects: [],
  ...extra,
});
const cat = (r, id) => r.categories.find((c) => c.id === id);
const check = (r, id, cid) => cat(r, id).checks.find((c) => c.id === cid);

const lorem = Array.from({ length: 40 }, (_, i) => `<p>Somos una peluquería del centro de Granada con más de diez años cuidando a nuestros clientes ${i}. Trabajamos con productos naturales.</p>`).join("");

const goodLocal = `<!doctype html><html lang="es"><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Peluquería Lola | Peluquería en el centro de Granada</title>
<meta name="description" content="Peluquería en el centro de Granada. Cortes, color y peinados de evento con productos naturales. Pide cita online o por WhatsApp.">
<meta property="og:title" content="Peluquería Lola"><meta property="og:image" content="https://ejemplo.es/og.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"HairSalon","name":"Lola"}</script>
</head><body>
<h1>Peluquería en el centro de Granada</h1><h2>Servicios</h2><h2>Precios</h2>
${lorem}
<a href="tel:+34958123456">958 123 456</a>
<a href="https://wa.me/34612345678">Escríbenos por WhatsApp</a>
<a href="https://booksy.com/es-es/123">Reservar cita</a>
<a href="mailto:hola@ejemplo.es">hola@ejemplo.es</a>
<iframe src="https://www.google.com/maps/embed?pb=1"></iframe>
<form><input name="nombre"><input name="email" type="email"><textarea name="m"></textarea><button>Enviar</button></form>
<img src="a.jpg" alt="Salón">
</body></html>`;

test("negocio local bien preparado: todo correcto y sin mejoras inventadas", () => {
  const r = analyzePage(page(goodLocal), noPsi);
  assert.equal(cat(r, "mobile").status, "good");
  assert.equal(cat(r, "seo").status, "good");
  assert.equal(cat(r, "content").status, "good");
  assert.equal(cat(r, "contact").status, "good");
  assert.equal(cat(r, "speed").status, "unknown", "sin PageSpeed la velocidad no se puntúa");
  assert.match(check(r, "contact", "tel").detail, /\+34958123456/);
  assert.equal(check(r, "contact", "whatsapp").status, "pass");
  assert.equal(check(r, "contact", "booking").status, "pass");
  assert.equal(check(r, "contact", "form").status, "pass");
  assert.equal(check(r, "contact", "map").status, "pass");
  assert.equal(r.improvements.length, 0);
});

const badLocal = `<html><head><title>Inicio</title><meta name="robots" content="noindex, nofollow"></head>
<body><div><img src="logo.png"><img src="foto.png"></div><p>Bienvenidos. Llámanos al 958 12 34 56.</p>
<a href="https://facebook.com/peluqueria">Facebook</a><form role="search"><input type="search" name="s"><input type="text" name="x"></form></body></html>`;

test("web con problemas: detecta noindex, falta de viewport y teléfono no clicable", () => {
  const r = analyzePage(page(badLocal, { finalUrl: "http://ejemplo.es/" }), noPsi);
  assert.equal(check(r, "mobile", "viewport").status, "fail");
  assert.equal(check(r, "seo", "https").status, "fail");
  assert.equal(check(r, "seo", "indexable").status, "fail");
  assert.equal(check(r, "seo", "title").status, "warn");
  assert.equal(check(r, "seo", "description").status, "fail");
  assert.equal(check(r, "contact", "tel").status, "warn");
  assert.match(check(r, "contact", "tel").detail, /958 12 34 56/);
  assert.equal(check(r, "contact", "booking").status, "info", "facebook no es un sistema de reservas");
  assert.equal(check(r, "contact", "form").status, "warn", "un buscador no es un formulario de contacto");
  assert.equal(r.improvements.length, 3);
  const titles = r.improvements.map((i) => i.title).join(" | ");
  assert.match(titles, /Google muestre tu web/);
  assert.match(titles, /móvil/);
});

const spa = `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>ALVEO Granada — Haz que tu negocio sea visible.</title>
<script type="module" src="/assets/index-abc.js"></script></head><body><div id="root"></div></body></html>`;

test("web hecha con JavaScript: lo avisa y no inventa resultados de contenido ni contacto", () => {
  const r = analyzePage(page(spa), noPsi);
  assert.equal(r.warnings.length, 1);
  assert.equal(cat(r, "content").status, "unknown");
  assert.equal(cat(r, "contact").status, "unknown");
  assert.ok(!r.improvements.some((i) => i.category === "contact" || i.category === "content"));
});

test("PageSpeed: usa la puntuación real que devuelve Google", () => {
  const psi = { available: true, performanceScore: 42, metrics: [{ label: "LCP", value: "5,1 s", rating: "poor" }], fieldData: null, opportunities: [], reportUrl: "x" };
  const r = analyzePage(page(goodLocal), psi);
  assert.equal(cat(r, "speed").status, "problem");
  assert.match(cat(r, "speed").summary, /42\/100/);
  assert.match(r.improvements[0].text, /42\/100/);
});

test("protección SSRF: IPs internas bloqueadas, públicas permitidas", () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1"]) {
    assert.equal(isPublicIp(ip), false, ip);
  }
  for (const ip of ["8.8.8.8", "151.101.0.223", "2a04:4e42::223"]) assert.equal(isPublicIp(ip), true, ip);
  assert.throws(() => normalizeUserUrl("file:///etc/passwd"));
  assert.throws(() => normalizeUserUrl("http://localhost/"));
  assert.throws(() => normalizeUserUrl("https://a:b@ejemplo.es"));
  assert.throws(() => normalizeUserUrl("https://ejemplo.es:8443/"));
  assert.equal(normalizeUserUrl("ejemplo.es").toString(), "https://ejemplo.es/");
});
