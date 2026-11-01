// Integración con Instagram Graph API — Business Discovery.
// Permite que la cuenta profesional de ALVEO consulte datos públicos de OTRAS cuentas
// profesionales (empresa o creador). Las cuentas personales no son consultables.
// No devuelve categoría, dirección ni botones de contacto: esos apartados no se puntúan.

import { config } from "../config.js";
import { fetchJson, UpstreamError } from "../safe-fetch.js";
import { normalizar, palabrasDeOferta } from "../sectors.js";

const MEDIA_LIMIT = 25;

export async function obtenerPerfil(usuario, { fetchImpl } = {}) {
  if (!/^[a-z0-9._]{1,30}$/.test(usuario)) throw new UpstreamError("Usuario no válido", { code: "invalid" });
  const campos = `business_discovery.username(${usuario}){username,name,biography,website,profile_picture_url,media_count,media.limit(${MEDIA_LIMIT}){timestamp,caption,media_type}}`;
  const params = new URLSearchParams({ fields: campos, access_token: config.instagram.accessToken });
  const url = `${config.instagram.baseUrl}/${config.instagram.graphVersion}/${encodeURIComponent(config.instagram.igUserId)}?${params}`;
  const r = await fetchJson(url, { fetchImpl });
  const bd = r?.business_discovery;
  if (!bd) throw new UpstreamError("Sin datos", { code: "no_business" });
  return bd;
}

const RE_DIRECCION = /\b(c\/|calle|avda\.?|avenida|plaza|pza\.?|paseo|camino|carretera|ctra\.?|callejon|cuesta|placeta|carrera|n\.?º|local\s+\d|18\d{3})\b|c\/\s*\S/;
const RE_CONTACTO = /(\b[6789]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b|\+34|wa\.me|whatsapp|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\breserv|\bcita\b|\bcitas\b|\bpedidos?\b|\bpresupuestos?\b|\bllamanos\b|\bescribenos\b|\bcontacto\b|\bdm\b|\bmd\b)/;

/** Reduce la respuesta a evidencias. No guarda pies de foto completos ni métricas de seguidores. */
export function reducirEvidencias(bd, { sector, sectorOtro, municipio, ahora = Date.now() }) {
  const bio = String(bd.biography ?? "");
  const bioN = normalizar(bio);
  const nombreN = normalizar(bd.name ?? "");
  const muni = normalizar(municipio);
  const mencionaMunicipio = [bioN, nombreN].some((t) => (muni && t.includes(muni)) || /\bgranada\b/.test(t));
  const media = Array.isArray(bd.media?.data) ? bd.media.data : [];
  const publicaciones = media
    .map((m) => ({ fecha: Date.parse(m.timestamp), conOferta: palabrasDeOferta(m.caption ?? "", sector, sectorOtro).length > 0 }))
    .filter((p) => Number.isFinite(p.fecha))
    .sort((a, b) => b.fecha - a.fecha);
  const dia = 86400000;
  return {
    usuario: bd.username ?? null,
    nombre: bd.name ?? null,
    biografia: bio,
    bioLongitud: [...bio.trim()].length,
    web: bd.website || null,
    fotoPerfil: !!bd.profile_picture_url,
    numPublicaciones: typeof bd.media_count === "number" ? bd.media_count : null,
    publicacionesAccesibles: publicaciones.length,
    ultimaPublicacion: publicaciones[0] ? new Date(publicaciones[0].fecha).toISOString() : null,
    publicaciones90d: publicaciones.filter((p) => ahora - p.fecha <= 90 * dia).length,
    publicacionesConOferta: publicaciones.slice(0, 12).filter((p) => p.conOferta).length,
    publicacionesRevisadasOferta: Math.min(12, publicaciones.length),
    palabrasOfertaBio: palabrasDeOferta(bio, sector, sectorOtro),
    mencionaMunicipio,
    direccionEnBio: RE_DIRECCION.test(bioN),
    contactoEnBio: RE_CONTACTO.test(bioN),
  };
}

export function motivoError(err) {
  if (err instanceof UpstreamError) {
    const e = err.body?.error;
    if (err.code === "no_business" || (e && (e.code === 110 || e.error_subcode === 2207013 || e.code === 100))) {
      return "Instagram solo permite consultar cuentas profesionales (de empresa o de creador) públicas. Si tu cuenta es personal, no podemos analizarla.";
    }
    if (e?.code === 4 || e?.code === 17 || e?.code === 32 || e?.code === 613) return "Hemos alcanzado temporalmente el límite de consultas de Instagram. Inténtalo más tarde.";
    if (e?.code === 190) return "La conexión de ALVEO con Instagram necesita renovarse. Inténtalo más tarde.";
    if (err.code === "timeout") return "Instagram no respondió a tiempo. Inténtalo de nuevo en unos minutos.";
  }
  return "Error temporal al consultar Instagram.";
}
