import { config } from "./config.js";
import { esRedireccionGoogleSegura, GOOGLE_MAPS_HOSTS } from "./url-validation.js";

const MAX_BYTES = 2 * 1024 * 1024;
const UA = "ALVEO-Analizador/1.0 (+https://alveo.es/analiza-tu-negocio)";

export class UpstreamError extends Error {
  constructor(message, { status = 0, body = null, code = "upstream" } = {}) {
    super(message);
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

/**
 * Petición JSON a una API documentada. No sigue redirecciones, limita tiempo y tamaño.
 * Nunca registra la URL (puede contener tokens).
 */
export async function fetchJson(url, { method = "GET", headers = {}, body, fetchImpl = fetch } = {}) {
  let res;
  try {
    res = await fetchImpl(url, {
      method,
      headers: { "User-Agent": UA, Accept: "application/json", ...headers },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (err) {
    const timeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    throw new UpstreamError(timeout ? "Tiempo de espera agotado" : "Error de conexión", { code: timeout ? "timeout" : "network" });
  }
  const text = await leerLimitado(res);
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* respuesta no JSON */ }
  if (!res.ok) throw new UpstreamError(`HTTP ${res.status}`, { status: res.status, body: json });
  if (json === null) throw new UpstreamError("Respuesta no válida", { status: res.status });
  return json;
}

async function leerLimitado(res) {
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_BYTES) { await res.body?.cancel(); throw new UpstreamError("Respuesta demasiado grande"); }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) { await reader.cancel(); throw new UpstreamError("Respuesta demasiado grande"); }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

/**
 * Resuelve un enlace corto de Google Maps leyendo solo la cabecera Location de cada salto.
 * - Máximo 5 saltos; cada destino debe ser HTTPS y de un dominio de Google admitido.
 * - Nunca descarga el cuerpo de las páginas.
 * - Se detiene en cuanto obtiene una URL de mapa completa.
 * @returns {Promise<string>} URL completa de Google Maps.
 */
export async function resolverEnlaceCorto(inicio, { fetchImpl = fetch } = {}) {
  let actual = inicio;
  for (let salto = 0; salto < 5; salto++) {
    if (!esRedireccionGoogleSegura(actual)) throw new UpstreamError("Redirección no permitida", { code: "redirect" });
    const u = new URL(actual);
    // Página de consentimiento de Google: el destino real viene en ?continue=
    if (u.hostname.startsWith("consent.google.")) {
      const cont = u.searchParams.get("continue");
      if (!cont) throw new UpstreamError("Redirección no permitida", { code: "redirect" });
      actual = cont;
      continue;
    }
    if (GOOGLE_MAPS_HOSTS.has(u.hostname) && (u.pathname.startsWith("/maps") || u.searchParams.has("cid"))) return u.toString();
    let res;
    try {
      res = await fetchImpl(actual, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9" },
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });
    } catch {
      throw new UpstreamError("No se pudo abrir el enlace corto", { code: "network" });
    }
    await res.body?.cancel().catch(() => {});
    const loc = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !loc) throw new UpstreamError("El enlace corto no redirige a una ficha de Google Maps", { code: "redirect" });
    actual = new URL(loc, actual).toString();
  }
  throw new UpstreamError("Demasiadas redirecciones", { code: "redirect" });
}
