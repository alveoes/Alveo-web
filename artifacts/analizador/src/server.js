import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { config, integrationStatus } from "./config.js";
import { OPCIONES, analizar, validarEntrada } from "./analyze.js";
import { RateLimiter, depurarRegistro, hashIp } from "./infra.js";
import { RUBRICA_VERSION, rubricaPublica } from "./rubric.js";

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const BASE = config.basePath;
const MAX_BODY = 8 * 1024;

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};

const CABECERAS_SEGURIDAD = {
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

const limitador = new RateLimiter(config.rateLimit);
let enCurso = 0;

function enviarJson(res, status, obj, extra = {}) {
  res.writeHead(status, { ...CABECERAS_SEGURIDAD, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra });
  res.end(JSON.stringify(obj));
}

function ipCliente(req) {
  if (config.trustProxy) {
    const xff = String(req.headers["x-forwarded-for"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    // El último valor lo añade el proxy de confianza; los anteriores podría falsearlos el cliente.
    if (xff.length) return xff.at(-1);
  }
  return req.socket.remoteAddress ?? "desconocida";
}

async function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const partes = [];
    req.on("data", (c) => {
      total += c.length;
      if (total > MAX_BODY) { reject(Object.assign(new Error("too_large"), { status: 413 })); req.destroy(); return; }
      partes.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(partes).toString("utf8")));
    req.on("error", reject);
  });
}

function origenValido(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

async function servirEstatico(res, rel) {
  const limpio = normalize(rel || "index.html").replace(/^([/\\])+/, "");
  const ruta = join(PUBLIC_DIR, limpio);
  if (!ruta.startsWith(PUBLIC_DIR) || limpio.split(sep).some((p) => p.startsWith("."))) return enviarJson(res, 404, { error: "No encontrado" });
  const tipo = TIPOS[extname(ruta)];
  if (!tipo) return enviarJson(res, 404, { error: "No encontrado" });
  try {
    const s = await stat(ruta);
    if (!s.isFile()) throw new Error("no file");
    const datos = await readFile(ruta);
    const cache = extname(ruta) === ".woff2" || extname(ruta) === ".png" ? "public, max-age=604800" : "no-cache";
    res.writeHead(200, { ...CABECERAS_SEGURIDAD, "Content-Type": tipo, "Cache-Control": cache });
    res.end(datos);
  } catch {
    enviarJson(res, 404, { error: "No encontrado" });
  }
}

async function manejarAnalisis(req, res) {
  if (!origenValido(req)) return enviarJson(res, 403, { error: "Origen no permitido." });
  if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) return enviarJson(res, 415, { error: "Formato no admitido." });
  let body;
  try { body = JSON.parse(await leerCuerpo(req)); } catch (err) {
    return enviarJson(res, err.status === 413 ? 413 : 400, { error: "Solicitud no válida." });
  }
  const v = validarEntrada(body);
  if (!v.ok) return enviarJson(res, 400, { errores: v.errores });

  const lim = limitador.intentar(hashIp(ipCliente(req)));
  if (!lim.ok) return enviarJson(res, 429, { error: "Has hecho varios análisis seguidos. Espera un poco antes de volver a intentarlo.", reintentarEnS: lim.reintentarEnS }, { "Retry-After": String(lim.reintentarEnS) });
  if (enCurso >= config.rateLimit.maxConcurrent) return enviarJson(res, 503, { error: "Ahora mismo hay muchos análisis en curso. Inténtalo en unos segundos." }, { "Retry-After": "10" });

  enCurso++;
  res.writeHead(200, { ...CABECERAS_SEGURIDAD, "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
  const emitir = (ev) => { if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(ev)}\n`); };
  try {
    await analizar(v.datos, emitir);
  } catch (err) {
    console.error(JSON.stringify({ nivel: "error", msg: "Fallo inesperado en el análisis", error: err?.message }));
    emitir({ tipo: "error", error: "Se produjo un error inesperado. Inténtalo de nuevo." });
  } finally {
    enCurso--;
    res.end();
  }
}

export const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const p = url.pathname;
    if (p === "/healthz" || p === `${BASE}/api/salud`) return enviarJson(res, 200, { ok: true });
    if (p === BASE) { res.writeHead(301, { Location: `${BASE}/` }); return res.end(); }
    if (!p.startsWith(`${BASE}/`)) return enviarJson(res, 404, { error: "No encontrado" });
    const rel = p.slice(BASE.length + 1);

    if (rel === "api/analizar") {
      if (req.method !== "POST") return enviarJson(res, 405, { error: "Método no permitido" }, { Allow: "POST" });
      return await manejarAnalisis(req, res);
    }
    if (req.method !== "GET" && req.method !== "HEAD") return enviarJson(res, 405, { error: "Método no permitido" });
    if (rel === "api/opciones") return enviarJson(res, 200, { ...OPCIONES, integraciones: integrationStatus(), rubrica: RUBRICA_VERSION });
    if (rel === "api/rubrica") return enviarJson(res, 200, rubricaPublica());
    if (rel.startsWith("api/")) return enviarJson(res, 404, { error: "No encontrado" });
    let decodificado;
    try { decodificado = decodeURIComponent(rel); } catch { return enviarJson(res, 400, { error: "Ruta no válida" }); }
    return await servirEstatico(res, decodificado);
  } catch (err) {
    console.error(JSON.stringify({ nivel: "error", msg: "Error en la petición", error: err?.message }));
    if (!res.headersSent) enviarJson(res, 500, { error: "Error interno" }); else res.end();
  }
});

server.requestTimeout = 60_000;
server.headersTimeout = 15_000;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await depurarRegistro();
  server.listen(config.port, () => {
    console.log(JSON.stringify({ nivel: "info", msg: `Analizador ALVEO en http://localhost:${config.port}${BASE}/`, integraciones: integrationStatus() }));
  });
}
