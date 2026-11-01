import { createHash, randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { config } from "./config.js";

// ---------- Caché en memoria con caducidad (LRU simple) ----------
export class Cache {
  constructor({ ttlMs, max }) { this.ttlMs = ttlMs; this.max = max; this.map = new Map(); }
  get(key) {
    const e = this.map.get(key);
    if (!e) return null;
    if (Date.now() > e.expira) { this.map.delete(key); return null; }
    this.map.delete(key); this.map.set(key, e);
    return e.valor;
  }
  set(key, valor) {
    this.map.delete(key);
    this.map.set(key, { valor, expira: Date.now() + this.ttlMs });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
}

// ---------- Límite de peticiones por IP (solo hash en memoria, sal aleatoria por arranque) ----------
const SAL = randomBytes(16);
export function hashIp(ip) {
  return createHash("sha256").update(SAL).update(String(ip)).digest("base64url").slice(0, 22);
}

export class RateLimiter {
  constructor({ shortWindowMs, shortMax, dailyMax }) {
    Object.assign(this, { shortWindowMs, shortMax, dailyMax });
    this.hits = new Map();
    setInterval(() => this.limpiar(), 15 * 60 * 1000).unref();
  }
  /** @returns {{ok:true} | {ok:false, reintentarEnS:number}} */
  intentar(clave, ahora = Date.now()) {
    const dia = 86400000;
    const lista = (this.hits.get(clave) ?? []).filter((t) => ahora - t < dia);
    const recientes = lista.filter((t) => ahora - t < this.shortWindowMs);
    if (recientes.length >= this.shortMax) return { ok: false, reintentarEnS: Math.ceil((recientes[0] + this.shortWindowMs - ahora) / 1000) };
    if (lista.length >= this.dailyMax) return { ok: false, reintentarEnS: Math.ceil((lista[0] + dia - ahora) / 1000) };
    lista.push(ahora);
    this.hits.set(clave, lista);
    return { ok: true };
  }
  limpiar(ahora = Date.now()) {
    for (const [k, v] of this.hits) if (!v.some((t) => ahora - t < 86400000)) this.hits.delete(k);
  }
}

// ---------- Presupuesto diario de llamadas a APIs externas (control de costes) ----------
export class DailyBudget {
  constructor(max) { this.max = max; this.dia = ""; this.usado = 0; }
  consumir(ahora = new Date()) {
    const d = ahora.toISOString().slice(0, 10);
    if (d !== this.dia) { this.dia = d; this.usado = 0; }
    if (this.usado >= this.max) return false;
    this.usado++;
    return true;
  }
}

// ---------- Registro interno de análisis (JSON Lines) ----------
// Guarda criterios, evidencias, fecha y versión de rúbrica para justificar cada cálculo.
// No guarda IP, ni textos o autores de reseñas, ni datos de contacto del visitante.
export async function registrarAnalisis(registro) {
  if (!config.audit.enabled) return;
  try {
    await mkdir(dirname(config.audit.file), { recursive: true });
    await appendFile(config.audit.file, `${JSON.stringify(registro)}\n`, "utf8");
  } catch (err) {
    console.error(JSON.stringify({ nivel: "error", msg: "No se pudo escribir el registro de análisis", error: err.code }));
  }
}

export async function depurarRegistro() {
  if (!config.audit.enabled) return;
  try {
    const texto = await readFile(config.audit.file, "utf8");
    const limite = Date.now() - config.audit.retentionDays * 86400000;
    const lineas = texto.split("\n").filter((l) => {
      if (!l.trim()) return false;
      try { return Date.parse(JSON.parse(l).fecha) >= limite; } catch { return false; }
    });
    await writeFile(config.audit.file, lineas.length ? `${lineas.join("\n")}\n` : "", "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") console.error(JSON.stringify({ nivel: "error", msg: "No se pudo depurar el registro", error: err.code }));
  }
}
