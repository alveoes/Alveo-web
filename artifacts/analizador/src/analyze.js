import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { MUNICIPIOS } from "./municipios.js";
import { SECTORES, sectorPorId } from "./sectors.js";
import { validarGoogle, validarInstagram, validarTiktok } from "./url-validation.js";
import { RUBRICA_VERSION, puntuar } from "./rubric.js";
import { Cache, DailyBudget, registrarAnalisis } from "./infra.js";
import * as google from "./platforms/google.js";
import * as instagram from "./platforms/instagram.js";

const cache = new Cache({ ttlMs: config.cacheTtlMs, max: config.cacheMaxEntries });
const presupuestos = {
  google: new DailyBudget(config.google.dailyBudget),
  instagram: new DailyBudget(config.instagram.dailyBudget),
};

const limpiarTexto = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

/** Valida el cuerpo de la petición. Devuelve {ok, datos} o {ok:false, errores}. */
export function validarEntrada(body) {
  const errores = {};
  const b = body && typeof body === "object" ? body : {};
  const negocio = limpiarTexto(b.negocio, 80);
  if (negocio.length < 2) errores.negocio = "Escribe el nombre del negocio.";
  const sector = sectorPorId(String(b.sector ?? "")) ? String(b.sector) : null;
  if (!sector) errores.sector = "Elige un sector.";
  const sectorOtro = sector === "otro" ? limpiarTexto(b.sectorOtro, 60) : "";
  if (sector === "otro" && sectorOtro.length < 2) errores.sectorOtro = "Indica a qué se dedica el negocio.";
  const municipio = MUNICIPIOS.includes(String(b.municipio ?? "")) ? String(b.municipio) : null;
  if (!municipio) errores.municipio = "Elige un municipio de la provincia de Granada.";

  const enlaces = {};
  const validadores = { instagram: validarInstagram, tiktok: validarTiktok, google: validarGoogle };
  const e = b.enlaces && typeof b.enlaces === "object" ? b.enlaces : {};
  for (const [p, validar] of Object.entries(validadores)) {
    const v = e[p];
    if (v === null || v === undefined || v === "") { enlaces[p] = null; continue; }
    const r = validar(v);
    if (r.ok) enlaces[p] = r; else errores[p] = r.error;
  }
  if (!Object.values(enlaces).some(Boolean) && !["instagram", "tiktok", "google"].some((p) => errores[p])) {
    errores.general = "Añade al menos un enlace válido de Instagram, TikTok o Google.";
  }
  if (Object.keys(errores).length) return { ok: false, errores };
  return { ok: true, datos: { negocio, sector, sectorOtro, municipio, enlaces } };
}

function noAnalizado(plataforma, motivo) {
  return { plataforma, estado: "no_analizado", motivo };
}

async function analizarGoogle(enlace, datos, paso, ahora) {
  if (!config.google.apiKey) return noAnalizado("google", "La conexión con Google está pendiente de configurar.");
  const claveEnlace = `google:url:${enlace.url}`;
  let ent = cache.get(claveEnlace);
  const desdeCache = !!ent;
  if (!ent) {
    if (!presupuestos.google.consumir()) return noAnalizado("google", "Hemos alcanzado el límite diario de análisis de Google. Inténtalo mañana.");
    try {
      const { placeId, metodo } = await google.identificarFicha(enlace, { negocio: datos.negocio, municipio: datos.municipio, progreso: paso });
      paso("Consultando los datos públicos de la ficha de Google");
      const evidencias = await google.obtenerDetalles(placeId);
      ent = { evidencias, metodo, fechaDatos: new Date(ahora).toISOString() };
      cache.set(claveEnlace, ent);
    } catch (err) {
      log("google", err);
      return noAnalizado("google", google.motivoError(err));
    }
  } else paso("Reutilizando una consulta reciente de Google");
  if (!google.esDeGranada(ent.evidencias)) return noAnalizado("google", "La ficha encontrada no está en la provincia de Granada. Esta herramienta es para negocios de Granada.");
  paso("Calculando puntuaciones de Google");
  const ctx = { ahora, hosteleria: !!sectorPorId(datos.sector)?.hosteleria };
  return resultado("google", ent, puntuar("google", ent.evidencias, ctx), desdeCache, {
    nombre: ent.evidencias.nombre, detalle: ent.evidencias.direccion, enlace: ent.evidencias.mapsUri,
  });
}

async function analizarInstagram(enlace, datos, paso, ahora) {
  if (!config.instagram.igUserId || !config.instagram.accessToken) return noAnalizado("instagram", "La conexión con Instagram está pendiente de configurar.");
  const clave = `instagram:${enlace.usuario}`;
  let ent = cache.get(clave);
  const desdeCache = !!ent;
  if (!ent) {
    if (!presupuestos.instagram.consumir()) return noAnalizado("instagram", "Hemos alcanzado el límite diario de análisis de Instagram. Inténtalo mañana.");
    paso(`Consultando el perfil público @${enlace.usuario}`);
    try {
      const bruto = await instagram.obtenerPerfil(enlace.usuario);
      ent = { bruto, fechaDatos: new Date(ahora).toISOString() };
      cache.set(clave, ent);
    } catch (err) {
      log("instagram", err);
      return noAnalizado("instagram", instagram.motivoError(err));
    }
  } else paso("Reutilizando una consulta reciente de Instagram");
  paso("Calculando puntuaciones de Instagram");
  const evidencias = instagram.reducirEvidencias(ent.bruto, { sector: datos.sector, sectorOtro: datos.sectorOtro, municipio: datos.municipio, ahora: Date.parse(ent.fechaDatos) });
  const conEvid = { ...ent, evidencias };
  return resultado("instagram", conEvid, puntuar("instagram", evidencias, { ahora: Date.parse(ent.fechaDatos) }), desdeCache, {
    nombre: `@${evidencias.usuario ?? enlace.usuario}`, detalle: null, enlace: enlace.url,
  });
}

function resultado(plataforma, ent, p, desdeCache, perfil) {
  return {
    plataforma, estado: "analizado", perfil, desdeCache, fechaDatos: ent.fechaDatos,
    puntuacion: p.puntuacion, cobertura: p.cobertura,
    apartadosComprobados: p.apartadosComprobados, apartadosTotales: p.apartadosTotales,
    apartados: p.apartados.map((a) => ({ id: a.id, nombre: a.nombre, puntuacion: a.puntuacion })),
    // Uso interno (registro). Se elimina antes de enviar al navegador.
    _interno: { evidencias: ent.evidencias, metodo: ent.metodo ?? null, detalle: p.apartados },
  };
}

function log(plataforma, err) {
  // Nunca se registran URLs (pueden contener tokens) ni datos del visitante.
  console.error(JSON.stringify({ nivel: "aviso", plataforma, codigo: err?.code ?? null, status: err?.status ?? null, apiError: err?.body?.error?.code ?? null }));
}

/**
 * Ejecuta el análisis. `emitir` recibe eventos de progreso reales a medida que ocurren.
 */
export async function analizar(datos, emitir) {
  const id = randomUUID();
  const ahora = Date.now();
  const tareas = [];
  const plataformas = ["google", "instagram", "tiktok"];
  emitir({ tipo: "inicio", id, plataformas: plataformas.map((p) => ({ plataforma: p, incluida: !!datos.enlaces[p] })) });

  for (const p of plataformas) {
    const enlace = datos.enlaces[p];
    const paso = (texto) => emitir({ tipo: "paso", plataforma: p, texto });
    const tarea = (async () => {
      let r;
      if (!enlace) r = { plataforma: p, estado: "sin_perfil" };
      else if (p === "tiktok") r = noAnalizado("tiktok", "Análisis de TikTok pendiente: TikTok no ofrece por ahora un acceso oficial a perfiles de terceros que podamos usar.");
      else {
        paso("Iniciando análisis");
        r = p === "google" ? await analizarGoogle(enlace, datos, paso, ahora) : await analizarInstagram(enlace, datos, paso, ahora);
      }
      const { _interno, ...publico } = r;
      emitir({ tipo: "plataforma", resultado: publico });
      return r;
    })();
    tareas.push(tarea);
  }
  const resultados = await Promise.all(tareas);
  const fecha = new Date(ahora).toISOString();

  await registrarAnalisis({
    id, fecha, rubrica: RUBRICA_VERSION,
    negocio: datos.negocio, sector: datos.sector, sectorOtro: datos.sectorOtro || undefined, municipio: datos.municipio,
    enlaces: Object.fromEntries(Object.entries(datos.enlaces).map(([k, v]) => [k, v?.url ?? null])),
    resultados: resultados.map((r) => ({
      plataforma: r.plataforma, estado: r.estado, motivo: r.motivo, puntuacion: r.puntuacion ?? null, cobertura: r.cobertura,
      fechaDatos: r.fechaDatos, desdeCache: r.desdeCache, metodoIdentificacion: r._interno?.metodo ?? undefined,
      evidencias: r._interno?.evidencias, criterios: r._interno?.detalle,
    })),
  });

  const publicos = resultados.map(({ _interno, ...r }) => r);
  const analisis = { id, fecha, rubrica: RUBRICA_VERSION, negocio: datos.negocio, municipio: datos.municipio, resultados: publicos };
  emitir({ tipo: "fin", analisis });
  return analisis;
}

export const OPCIONES = { sectores: SECTORES.map(({ id, nombre }) => ({ id, nombre })), municipios: MUNICIPIOS };
