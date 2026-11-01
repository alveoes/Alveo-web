// Integración con Google Places API (New): Text Search + Place Details.
// Documentación: https://developers.google.com/maps/documentation/places/web-service
// Solo se usan métodos oficiales con clave de API del servidor.

import { config } from "../config.js";
import { fetchJson, resolverEnlaceCorto, UpstreamError } from "../safe-fetch.js";
import { interpretarUrlMaps } from "../url-validation.js";
import { normalizar } from "../sectors.js";

export const SIN_ANALIZAR = (motivo) => ({ estado: "no_analizado", motivo });

// Campos de Place Details. Incluir reseñas y valoración factura el SKU «Enterprise + Atmosphere».
const DETAILS_FIELDS = [
  "id", "displayName", "formattedAddress", "addressComponents", "location", "businessStatus",
  "primaryType", "primaryTypeDisplayName", "types", "regularOpeningHours",
  "nationalPhoneNumber", "internationalPhoneNumber", "websiteUri", "googleMapsUri",
  "rating", "userRatingCount", "reviews", "photos",
  "dineIn", "takeout", "delivery", "reservable",
].join(",");

const SEARCH_FIELDS = "places.id,places.displayName,places.googleMapsUri,places.location,places.formattedAddress";

// Tipos demasiado genéricos para considerarse una categoría clara.
export const TIPOS_GENERICOS = new Set([
  "point_of_interest", "establishment", "store", "food", "service", "premise", "street_address",
  "geocode", "political", "locality", "health", "finance", "general_contractor", "business",
]);

const GRANADA_CENTRO = { latitude: 37.1773, longitude: -3.5986 };

function headers(fieldMask) {
  return { "X-Goog-Api-Key": config.google.apiKey, "X-Goog-FieldMask": fieldMask, "Content-Type": "application/json" };
}

function distanciaM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad, dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function cidDe(uri) {
  try { return new URL(uri).searchParams.get("cid"); } catch { return null; }
}

function nombresParecidos(a, b) {
  const x = normalizar(a).replace(/[^a-z0-9ñ]+/g, " ").trim();
  const y = normalizar(b).replace(/[^a-z0-9ñ]+/g, " ").trim();
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

/**
 * Identifica la ficha a partir del enlace. Devuelve {placeId, metodo} o lanza UpstreamError.
 * Nunca elige una ficha si no puede verificar la coincidencia.
 */
export async function identificarFicha(enlace, { negocio, municipio, progreso, fetchImpl } = {}) {
  let url = enlace.url;
  if (enlace.corto) {
    progreso?.("Abriendo el enlace corto de Google Maps");
    url = await resolverEnlaceCorto(url, { fetchImpl });
  }
  const datos = interpretarUrlMaps(url);
  if (datos.placeId) return { placeId: datos.placeId, metodo: "place_id del enlace" };

  const texto = datos.nombre || `${negocio} ${municipio}`;
  const centro = datos.lat !== null ? { latitude: datos.lat, longitude: datos.lng } : GRANADA_CENTRO;
  const radio = datos.lat !== null ? 2000 : 50000;
  progreso?.("Localizando la ficha en Google");
  const r = await fetchJson(`${config.google.baseUrl}/v1/places:searchText`, {
    method: "POST",
    headers: headers(SEARCH_FIELDS),
    body: JSON.stringify({ textQuery: texto, languageCode: "es", regionCode: "ES", pageSize: 5, locationBias: { circle: { center: centro, radius: radio } } }),
    fetchImpl,
  });
  const candidatos = Array.isArray(r?.places) ? r.places : [];
  if (datos.cid) {
    const c = candidatos.find((p) => cidDe(p.googleMapsUri) === datos.cid);
    if (c) return { placeId: c.id, metodo: "identificador de ficha (CID) verificado" };
    throw new UpstreamError("No se pudo verificar la ficha", { code: "no_match" });
  }
  if (datos.lat !== null) {
    const c = candidatos.find((p) => p.location && distanciaM(centro, p.location) <= 250 && nombresParecidos(p.displayName?.text, texto));
    if (c) return { placeId: c.id, metodo: "nombre y coordenadas del enlace" };
    throw new UpstreamError("No se pudo verificar la ficha", { code: "no_match" });
  }
  const c = candidatos.find((p) => nombresParecidos(p.displayName?.text, texto));
  if (c) return { placeId: c.id, metodo: "nombre del enlace" };
  throw new UpstreamError("No se pudo verificar la ficha", { code: "no_match" });
}

/** Descarga Place Details y lo reduce a evidencias (sin textos ni autores de reseñas). */
export async function obtenerDetalles(placeId, { fetchImpl } = {}) {
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) throw new UpstreamError("Identificador no válido", { code: "no_match" });
  const p = await fetchJson(`${config.google.baseUrl}/v1/places/${encodeURIComponent(placeId)}?languageCode=es&regionCode=ES`, {
    headers: headers(DETAILS_FIELDS),
    fetchImpl,
  });
  return reducirEvidencias(p);
}

export function reducirEvidencias(p) {
  const comp = Array.isArray(p.addressComponents) ? p.addressComponents : [];
  const tiene = (t) => comp.some((c) => Array.isArray(c.types) && c.types.includes(t));
  const provincia = comp.find((c) => c.types?.includes("administrative_area_level_2"))?.longText ?? null;
  const municipio = comp.find((c) => c.types?.includes("locality"))?.longText ?? null;
  const resenas = Array.isArray(p.reviews) ? p.reviews : [];
  const fechas = resenas.map((r) => Date.parse(r.publishTime)).filter(Number.isFinite);
  const tipos = Array.isArray(p.types) ? p.types : [];
  return {
    placeId: p.id ?? null,
    nombre: p.displayName?.text ?? null,
    direccion: p.formattedAddress ?? null,
    tieneCalle: tiene("route"),
    tieneNumero: tiene("street_number"),
    provincia,
    municipio,
    estado: p.businessStatus ?? null,
    categoriaPrincipal: p.primaryType ?? null,
    categoriaNombre: p.primaryTypeDisplayName?.text ?? null,
    categoriasEspecificas: tipos.filter((t) => !TIPOS_GENERICOS.has(t) && t !== p.primaryType),
    horario: Array.isArray(p.regularOpeningHours?.periods) && p.regularOpeningHours.periods.length > 0,
    horarioTexto: Array.isArray(p.regularOpeningHours?.weekdayDescriptions) ? p.regularOpeningHours.weekdayDescriptions : null,
    telefono: !!(p.nationalPhoneNumber || p.internationalPhoneNumber),
    web: p.websiteUri ?? null,
    mapsUri: p.googleMapsUri ?? null,
    valoracion: typeof p.rating === "number" ? p.rating : null,
    numResenas: typeof p.userRatingCount === "number" ? p.userRatingCount : 0,
    resenasEnMuestra: resenas.length,
    resenaMasReciente: fechas.length ? new Date(Math.max(...fechas)).toISOString() : null,
    fotosEnMuestra: Array.isArray(p.photos) ? p.photos.length : 0,
    atributos: { dineIn: p.dineIn, takeout: p.takeout, delivery: p.delivery, reservable: p.reservable },
  };
}

export function esDeGranada(ev) {
  return normalizar(ev.provincia ?? "") === "granada";
}

/** Traduce errores técnicos a motivos comprensibles, sin culpar al negocio. */
export function motivoError(err) {
  if (err instanceof UpstreamError) {
    if (err.code === "no_match") return "No hemos podido identificar con seguridad la ficha a partir del enlace. Prueba a copiar el enlace desde el botón «Compartir» de tu ficha.";
    if (err.code === "redirect") return "El enlace corto no lleva a una ficha de Google Maps válida.";
    if (err.code === "timeout") return "Google no respondió a tiempo. Inténtalo de nuevo en unos minutos.";
    if (err.status === 404) return "Google no devuelve datos para esa ficha.";
  }
  return "Error temporal al consultar Google.";
}
