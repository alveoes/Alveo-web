// Validación estricta de enlaces. Solo se aceptan dominios de las plataformas previstas.
// Nada de lo que se valida aquí se descarga, salvo los enlaces cortos de Google Maps,
// que se resuelven en safe-fetch.js siguiendo únicamente redirecciones a dominios de Google.

const MAX_LEN = 600;

export const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
export const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);
export const TIKTOK_SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"]);

// Hosts con mapas completos (no requieren red para interpretarse).
export const GOOGLE_MAPS_HOSTS = new Set([
  "google.com", "www.google.com", "google.es", "www.google.es",
  "maps.google.com", "maps.google.es",
]);
// Hosts de enlaces cortos o de compartir de Google que requieren seguir redirecciones.
export const GOOGLE_SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "g.page", "share.google", "g.co"]);
// Destinos de redirección admitidos al resolver enlaces cortos.
export const GOOGLE_REDIRECT_HOSTS = new Set([...GOOGLE_MAPS_HOSTS, ...GOOGLE_SHORT_HOSTS, "consent.google.com", "consent.google.es"]);

const IG_RESERVED = new Set(["p", "reel", "reels", "stories", "explore", "accounts", "direct", "tv", "about", "legal", "developer", "web", "challenge", "privacy", "terms", "session", "login", "emails", "ar"]);

function toUrl(raw) {
  let s = String(raw ?? "").trim();
  if (!s || s.length > MAX_LEN) return null;
  if (/\s/.test(s)) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== "443" && u.port !== "80") return null;
  u.protocol = "https:";
  u.port = "";
  u.hostname = u.hostname.toLowerCase().replace(/\.$/, "");
  return u;
}

/** @returns {{ok:true, usuario:string, url:string} | {ok:false, error:string}} */
export function validarInstagram(raw) {
  const s = String(raw ?? "").trim();
  const arroba = /^@([A-Za-z0-9._]{1,30})$/.exec(s);
  if (arroba) return finIg(arroba[1]);
  const u = toUrl(s);
  if (!u || !INSTAGRAM_HOSTS.has(u.hostname)) return { ok: false, error: "El enlace debe ser de instagram.com, por ejemplo https://www.instagram.com/tunegocio/" };
  const partes = u.pathname.split("/").filter(Boolean);
  if (partes.length < 1) return { ok: false, error: "Falta el nombre de usuario en el enlace de Instagram." };
  if (IG_RESERVED.has(partes[0].toLowerCase())) return { ok: false, error: "Ese enlace es de una publicación o página de Instagram, no de un perfil. Usa el enlace de tu perfil." };
  if (!/^[A-Za-z0-9._]{1,30}$/.test(partes[0])) return { ok: false, error: "El nombre de usuario de Instagram no es válido." };
  return finIg(partes[0]);
}

function finIg(usuario) {
  const u = usuario.toLowerCase();
  if (u.startsWith(".") || u.endsWith(".") || u.includes("..")) return { ok: false, error: "El nombre de usuario de Instagram no es válido." };
  return { ok: true, usuario: u, url: `https://www.instagram.com/${u}/` };
}

/** @returns {{ok:true, usuario:string|null, url:string, corto:boolean} | {ok:false, error:string}} */
export function validarTiktok(raw) {
  const s = String(raw ?? "").trim();
  const arroba = /^@([A-Za-z0-9._]{2,24})$/.exec(s);
  if (arroba) return { ok: true, usuario: arroba[1].toLowerCase(), url: `https://www.tiktok.com/@${arroba[1].toLowerCase()}`, corto: false };
  const u = toUrl(s);
  if (!u) return { ok: false, error: "El enlace de TikTok no es válido." };
  if (TIKTOK_SHORT_HOSTS.has(u.hostname)) {
    if (!/^\/[A-Za-z0-9]{5,20}\/?$/.test(u.pathname)) return { ok: false, error: "El enlace corto de TikTok no es válido." };
    return { ok: true, usuario: null, url: `https://${u.hostname}${u.pathname}`, corto: true };
  }
  if (!TIKTOK_HOSTS.has(u.hostname)) return { ok: false, error: "El enlace debe ser de tiktok.com, por ejemplo https://www.tiktok.com/@tunegocio" };
  const m = /^\/@([A-Za-z0-9._]{2,24})(\/.*)?$/.exec(u.pathname);
  if (!m) return { ok: false, error: "Usa el enlace de tu perfil de TikTok (contiene @usuario)." };
  return { ok: true, usuario: m[1].toLowerCase(), url: `https://www.tiktok.com/@${m[1].toLowerCase()}`, corto: false };
}

/**
 * Valida un enlace de Google Maps / Perfil de Empresa.
 * @returns {{ok:true, url:string, corto:boolean} | {ok:false, error:string}}
 */
export function validarGoogle(raw) {
  const u = toUrl(raw);
  const error = "El enlace debe ser de Google Maps, por ejemplo https://maps.app.goo.gl/AbCdEf123 o https://www.google.com/maps/place/…";
  if (!u) return { ok: false, error };
  if (GOOGLE_SHORT_HOSTS.has(u.hostname)) {
    if (u.hostname === "goo.gl" && !u.pathname.startsWith("/maps/")) return { ok: false, error };
    if (u.hostname === "g.co" && !u.pathname.startsWith("/kgs/")) return { ok: false, error };
    if (!/^\/[A-Za-z0-9_\-/]{2,120}$/.test(u.pathname)) return { ok: false, error };
    return { ok: true, url: u.toString(), corto: true };
  }
  if (GOOGLE_MAPS_HOSTS.has(u.hostname)) {
    const esMapa = u.pathname.startsWith("/maps") || (u.hostname.startsWith("maps.") && (u.searchParams.has("cid") || u.searchParams.has("q")));
    if (!esMapa) return { ok: false, error };
    const datos = interpretarUrlMaps(u.toString());
    if (!datos.placeId && !datos.cid && !datos.nombre) return { ok: false, error: "Ese enlace de Google Maps no identifica un negocio. Abre la ficha de tu negocio y copia su enlace." };
    return { ok: true, url: u.toString(), corto: false };
  }
  return { ok: false, error };
}

/**
 * Extrae identificadores de una URL completa de Google Maps sin hacer peticiones.
 * @returns {{placeId:string|null, cid:string|null, nombre:string|null, lat:number|null, lng:number|null}}
 */
export function interpretarUrlMaps(href) {
  const res = { placeId: null, cid: null, nombre: null, lat: null, lng: null };
  let u;
  try { u = new URL(href); } catch { return res; }
  const q = u.searchParams;
  const pid = q.get("query_place_id") || q.get("place_id");
  if (pid && /^[A-Za-z0-9_-]{10,300}$/.test(pid)) res.placeId = pid;
  const cid = q.get("cid");
  if (cid && /^\d{1,25}$/.test(cid)) res.cid = cid;
  const full = decodeURIComponentSafe(u.pathname + u.search);
  const ftid = q.get("ftid") || (/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(full)?.[1] ?? null);
  if (!res.cid && ftid) {
    const hex = /^0x[0-9a-f]+:0x([0-9a-f]{1,16})$/i.exec(ftid)?.[1];
    if (hex) res.cid = BigInt(`0x${hex}`).toString();
  }
  const place = /^\/maps\/place\/([^/]+)/.exec(u.pathname);
  if (place) res.nombre = limpiarNombre(place[1]);
  else if (q.get("q")) res.nombre = limpiarNombre(q.get("q"));
  const exacta = /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/.exec(full);
  const vista = /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(full);
  const c = exacta || vista;
  if (c) {
    const lat = Number(c[1]), lng = Number(c[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) { res.lat = lat; res.lng = lng; }
  }
  return res;
}

function decodeURIComponentSafe(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

function limpiarNombre(s) {
  const t = decodeURIComponentSafe(String(s).replace(/\+/g, " ")).replace(/[\u0000-\u001f]/g, "").trim();
  return t ? t.slice(0, 150) : null;
}

/** Comprueba si una URL de redirección es un destino de Google admitido (HTTPS y host permitido). */
export function esRedireccionGoogleSegura(href) {
  let u;
  try { u = new URL(href); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  if (u.port && u.port !== "443") return false;
  return GOOGLE_REDIRECT_HOSTS.has(u.hostname.toLowerCase());
}
