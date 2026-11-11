/**
 * Descarga segura de páginas web externas (protección frente a SSRF).
 *
 * - Solo http/https, puertos 80 y 443, sin credenciales en la URL.
 * - Resuelve el DNS y rechaza cualquier IP privada, local o reservada.
 * - La conexión se hace a la IP ya validada (evita DNS rebinding).
 * - Redirecciones manuales (máx. 5), revalidando cada salto.
 * - Límites de tiempo y de tamaño (también tras descomprimir).
 */
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import type { LookupFunction } from "node:net";

export class SafeFetchError extends Error {
  constructor(
    public code:
      | "invalid_url"
      | "blocked_target"
      | "dns_failed"
      | "timeout"
      | "too_large"
      | "too_many_redirects"
      | "not_html"
      | "http_error"
      | "network_error",
    message: string,
  ) {
    super(message);
  }
}

const MAX_REDIRECTS = 5;
const MAX_BYTES = 3 * 1024 * 1024; // 3 MB de HTML descomprimido
const TIMEOUT_MS = 12_000;
export const USER_AGENT =
  "Mozilla/5.0 (compatible; ALVEO-Analizador/1.0; +https://alveoagencia.es/analizador)";

const blockList = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockList.addSubnet(addr, prefix, "ipv4");
}
for (const [addr, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blockList.addSubnet(addr, prefix, "ipv6");
}

export function isPublicIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return !blockList.check(ip, "ipv4");
  if (family === 6) {
    // IPv4 mapeada (::ffff:a.b.c.d o ::ffff:7f00:1): se valida como IPv4.
    const m = ip.toLowerCase().match(/^(?:0{0,4}:){0,5}:?ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
    if (m) {
      if (m[1]) return isPublicIp(m[1]);
      const hi = parseInt(m[2], 16);
      const lo = parseInt(m[3], 16);
      return isPublicIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return !blockList.check(ip, "ipv6");
  }
  return false;
}

/** Normaliza y valida la URL introducida por el usuario. */
export function normalizeUserUrl(input: unknown): URL {
  if (typeof input !== "string") {
    throw new SafeFetchError("invalid_url", "Introduce la dirección de tu web.");
  }
  let raw = input.trim();
  if (!raw || raw.length > 2048) {
    throw new SafeFetchError("invalid_url", "La dirección no es válida.");
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError("invalid_url", "La dirección no es válida.");
  }
  validateUrlShape(url);
  url.hash = "";
  return url;
}

function validateUrlShape(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchError("invalid_url", "Solo se pueden analizar direcciones http o https.");
  }
  if (url.username || url.password) {
    throw new SafeFetchError("invalid_url", "La dirección no puede incluir usuario ni contraseña.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new SafeFetchError("blocked_target", "Solo se pueden analizar webs en los puertos estándar.");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (!isPublicIp(host)) {
      throw new SafeFetchError("blocked_target", "Esa dirección no es una web pública.");
    }
    return;
  }
  if (!host.includes(".")) {
    throw new SafeFetchError("invalid_url", "Escribe la dirección completa, por ejemplo: www.tunegocio.es");
  }
  if (
    host.endsWith(".") ||
    /\.(local|localhost|internal|intranet|lan|home|corp|arpa)$/.test(host) ||
    host === "localhost"
  ) {
    throw new SafeFetchError("blocked_target", "Esa dirección no es una web pública.");
  }
}

/** lookup que solo devuelve IPs públicas; se usa en el propio socket. */
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => !isPublicIp(a.address))) {
      const e = new SafeFetchError("blocked_target", "Esa dirección no es una web pública.");
      return callback(e as unknown as NodeJS.ErrnoException, "", 4);
    }
    if ((options as { all?: boolean }).all) {
      return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    }
    callback(null, list[0].address, list[0].family);
  });
};

export interface FetchedPage {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  headers: http.IncomingHttpHeaders;
  html: string;
  /** Tiempo hasta recibir las cabeceras de la página final (ms). */
  responseTimeMs: number;
  /** Tamaño del HTML transferido (bytes, comprimido si aplica). */
  transferBytes: number;
  htmlBytes: number;
  redirects: string[];
}

interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  transferBytes: number;
  responseTimeMs: number;
}

function requestOnce(url: URL, deadline: number, readBody: boolean): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new SafeFetchError("timeout", "La web tardó demasiado en responder."));
    const lib = url.protocol === "https:" ? https : http;
    const started = Date.now();
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: safeLookup,
        agent: false,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
        },
        timeout: remaining,
      },
      (res) => {
        const responseTimeMs = Date.now() - started;
        const status = res.statusCode ?? 0;
        if (!readBody || (status >= 300 && status < 400)) {
          res.resume();
          return resolve({ status, headers: res.headers, body: Buffer.alloc(0), transferBytes: 0, responseTimeMs });
        }
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase().trim();
        let stream: NodeJS.ReadableStream = res;
        let transferBytes = 0;
        res.on("data", (c: Buffer) => {
          transferBytes += c.length;
          if (transferBytes > MAX_BYTES) req.destroy(new SafeFetchError("too_large", "La página es demasiado grande para analizarla."));
        });
        if (enc === "gzip" || enc === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
        else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) {
            req.destroy(new SafeFetchError("too_large", "La página es demasiado grande para analizarla."));
            return;
          }
          chunks.push(c);
        });
        stream.on("end", () =>
          resolve({ status, headers: res.headers, body: Buffer.concat(chunks), transferBytes, responseTimeMs }),
        );
        stream.on("error", (e) => reject(e));
      },
    );
    req.on("timeout", () => req.destroy(new SafeFetchError("timeout", "La web tardó demasiado en responder.")));
    req.on("error", (e) => reject(e));
    req.end();
  });
}

function mapError(e: unknown): SafeFetchError {
  if (e instanceof SafeFetchError) return e;
  const code = (e as NodeJS.ErrnoException)?.code ?? "";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ENODATA") {
    return new SafeFetchError("dns_failed", "No encontramos ninguna web en esa dirección. Revisa que esté bien escrita.");
  }
  if (code === "ETIMEDOUT") {
    return new SafeFetchError("timeout", "La web tardó demasiado en responder.");
  }
  if (code.startsWith("ERR_TLS") || code.includes("CERT") || code === "EPROTO") {
    return new SafeFetchError("network_error", "La web tiene un problema con su certificado de seguridad (HTTPS) y no se pudo abrir de forma segura.");
  }
  return new SafeFetchError("network_error", "No pudimos conectar con la web. Puede estar caída o bloquear visitas automáticas.");
}

function decodeBody(body: Buffer, contentType: string): string {
  const m = contentType.match(/charset=["']?([\w-]+)/i) ?? body.subarray(0, 2048).toString("latin1").match(/<meta[^>]+charset=["']?([\w-]+)/i);
  const charset = (m?.[1] ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

/** Descarga una página HTML pública de forma segura. */
export async function safeFetchHtml(start: URL): Promise<FetchedPage> {
  const deadline = Date.now() + TIMEOUT_MS;
  const redirects: string[] = [];
  let url = start;
  try {
    for (let hop = 0; ; hop++) {
      validateUrlShape(url);
      const res = await requestOnce(url, deadline, true);
      if (res.status >= 300 && res.status < 400 && res.headers.location) {
        if (hop >= MAX_REDIRECTS) {
          throw new SafeFetchError("too_many_redirects", "La web redirige demasiadas veces.");
        }
        redirects.push(url.toString());
        url = new URL(res.headers.location, url);
        url.hash = "";
        continue;
      }
      if (res.status >= 400) {
        throw new SafeFetchError(
          "http_error",
          res.status === 403 || res.status === 429
            ? `La web ha bloqueado nuestro análisis automático (código ${res.status}). Suele deberse a un cortafuegos o protección anti-bots.`
            : `La web respondió con un error (código ${res.status}).`,
        );
      }
      const ctype = String(res.headers["content-type"] ?? "");
      if (ctype && !/html|xml/i.test(ctype)) {
        throw new SafeFetchError("not_html", "Esa dirección no es una página web (no devuelve HTML).");
      }
      return {
        requestedUrl: start.toString(),
        finalUrl: url.toString(),
        status: res.status,
        headers: res.headers,
        html: decodeBody(res.body, ctype),
        responseTimeMs: res.responseTimeMs,
        transferBytes: res.transferBytes,
        htmlBytes: res.body.length,
        redirects,
      };
    }
  } catch (e) {
    throw mapError(e);
  }
}
