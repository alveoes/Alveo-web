// Rúbrica de puntuación. Cada subcriterio devuelve:
//   { valor: número entre 0 y 1 | null, evidencia: texto }
// null significa «Datos insuficientes»: el subcriterio se excluye del cálculo
// y NO cuenta como fallo. Las puntuaciones se renormalizan sobre lo comprobado.
//
// Reglas de cobertura:
//  - Un apartado se puntúa si los subcriterios comprobados suman >= 50 % de su peso.
//  - Una plataforma recibe puntuación global si los apartados puntuados suman >= 60 % del peso.
//  - Cobertura «completa» solo si todos los apartados (incluidos los no ponderados) se han comprobado.

export const RUBRICA_VERSION = "2026.11-v1";
export const MIN_COBERTURA_APARTADO = 0.5;
export const MIN_COBERTURA_PLATAFORMA = 0.6;

const DIA = 86400000;
const tramo = (x, tramos) => { for (const [max, v] of tramos) if (x <= max) return v; return tramos.at(-1)[1]; };
const dias = (iso, ahora) => (ahora - Date.parse(iso)) / DIA;
const redes = /(^|\.)(instagram\.com|facebook\.com|tiktok\.com|linktr\.ee|wa\.me|whatsapp\.com|x\.com|twitter\.com)$/i;
const hostDe = (u) => { try { return new URL(u).hostname; } catch { return ""; } };

export const RUBRICA = {
  google: {
    nombre: "Google",
    apartados: [
      {
        id: "completitud", nombre: "Completitud de la ficha", peso: 10,
        criterios: [
          { id: "direccion", nombre: "Dirección con calle", peso: 1, evaluar: (e) =>
            e.tieneCalle ? { valor: 1, evidencia: "Dirección con calle publicada" }
              : { valor: null, evidencia: "Sin dirección a pie de calle (puede ser un negocio sin atención al público en local)" } },
          { id: "telefono", nombre: "Teléfono", peso: 1, evaluar: (e) => ({ valor: e.telefono ? 1 : 0, evidencia: e.telefono ? "Teléfono publicado" : "Sin teléfono en la ficha" }) },
          { id: "web", nombre: "Sitio web", peso: 1, evaluar: (e) => ({ valor: e.web ? 1 : 0, evidencia: e.web ? "Enlace web publicado" : "Sin enlace web" }) },
          { id: "horario", nombre: "Horario", peso: 1, evaluar: (e) => ({ valor: e.horario ? 1 : 0, evidencia: e.horario ? "Horario publicado" : "Sin horario" }) },
          { id: "categoria", nombre: "Categoría", peso: 1, evaluar: (e) => ({ valor: e.categoriaPrincipal ? 1 : 0, evidencia: e.categoriaPrincipal ? `Categoría: ${e.categoriaNombre ?? e.categoriaPrincipal}` : "Sin categoría principal" }) },
          { id: "fotos", nombre: "Fotos", peso: 1, evaluar: (e) => ({ valor: e.fotosEnMuestra > 0 ? 1 : 0, evidencia: `${e.fotosEnMuestra} fotos devueltas por Google` }) },
        ],
      },
      {
        id: "horarios", nombre: "Horarios", peso: 15,
        criterios: [
          { id: "horario_publicado", nombre: "Horario semanal publicado", peso: 1, evaluar: (e) =>
            ({ valor: e.horario ? 1 : 0, evidencia: e.horario ? "Horario semanal con franjas definidas" : "La ficha no tiene horario semanal" }) },
        ],
      },
      {
        id: "categoria_servicios", nombre: "Categoría y servicios", peso: 10,
        criterios: [
          { id: "categoria_especifica", nombre: "Categoría principal específica", peso: 60, evaluar: (e) => {
            if (!e.categoriaPrincipal) return { valor: 0, evidencia: "Sin categoría principal" };
            const generica = ["point_of_interest", "establishment", "store", "food", "service"].includes(e.categoriaPrincipal);
            return { valor: generica ? 0.3 : 1, evidencia: `Categoría principal: ${e.categoriaPrincipal}${generica ? " (genérica)" : ""}` };
          } },
          { id: "categorias_adicionales", nombre: "Categorías adicionales", peso: 40, evaluar: (e) =>
            ({ valor: e.categoriasEspecificas.length > 0 ? 1 : 0, evidencia: `${e.categoriasEspecificas.length} categorías específicas adicionales` }) },
          { id: "atributos_hosteleria", nombre: "Opciones de servicio declaradas (hostelería)", peso: 30, evaluar: (e, ctx) => {
            if (!ctx.hosteleria) return { valor: null, noAplica: true, evidencia: "No aplica a este sector" };
            const v = Object.values(e.atributos ?? {});
            const declarados = v.filter((x) => typeof x === "boolean").length;
            return { valor: declarados / 4, evidencia: `${declarados} de 4 opciones declaradas (en local, para llevar, a domicilio, reservas)` };
          } },
        ],
      },
      {
        id: "fotos", nombre: "Fotos", peso: 15,
        criterios: [
          { id: "cantidad_fotos", nombre: "Fotos disponibles", peso: 1, evaluar: (e) =>
            ({ valor: tramo(e.fotosEnMuestra, [[0, 0], [2, 0.4], [5, 0.7], [9, 0.85], [Infinity, 1]]),
               evidencia: `${e.fotosEnMuestra} fotos (Google devuelve como máximo 10)` }) },
        ],
      },
      {
        id: "resenas", nombre: "Reseñas", peso: 30,
        criterios: [
          { id: "valoracion", nombre: "Valoración media", peso: 40, evaluar: (e) => {
            if (!e.numResenas) return { valor: null, noAplica: true, evidencia: "Sin reseñas: no hay valoración que medir" };
            if (e.valoracion === null) return { valor: null, evidencia: "Google no devolvió la valoración media" };
            return { valor: Math.min(1, Math.max(0, (e.valoracion - 3) / 1.8)), evidencia: `Valoración ${e.valoracion.toFixed(1)} (escala: 3,0 = 0 puntos; 4,8 o más = máximo)` };
          } },
          { id: "volumen", nombre: "Número de reseñas", peso: 35, evaluar: (e) =>
            ({ valor: tramo(e.numResenas, [[0, 0], [9, 0.3], [49, 0.6], [149, 0.8], [Infinity, 1]]), evidencia: `${e.numResenas} reseñas` }) },
          { id: "actualidad", nombre: "Reseñas recientes", peso: 25, evaluar: (e, ctx) => {
            if (!e.numResenas) return { valor: null, noAplica: true, evidencia: "Sin reseñas" };
            if (!e.resenaMasReciente) return { valor: null, evidencia: "Google no devolvió reseñas con fecha" };
            const d = dias(e.resenaMasReciente, ctx.ahora);
            // Google solo devuelve hasta 5 reseñas «relevantes», no las más nuevas:
            // solo podemos confirmar actualidad, no descartarla.
            if (d <= 180) return { valor: 1, evidencia: `Reseña de hace ${Math.round(d)} días entre las devueltas` };
            return { valor: null, evidencia: "Las reseñas devueltas no permiten confirmar la actualidad" };
          } },
        ],
      },
      {
        id: "respuestas", nombre: "Respuestas del propietario", peso: 0,
        criterios: [
          { id: "respuestas_propietario", nombre: "Respuestas a reseñas", peso: 1, evaluar: () =>
            ({ valor: null, evidencia: "La API pública de Google no incluye las respuestas del propietario" }) },
        ],
      },
      {
        id: "contacto", nombre: "Contacto y web", peso: 20,
        criterios: [
          { id: "telefono", nombre: "Teléfono", peso: 50, evaluar: (e) => ({ valor: e.telefono ? 1 : 0, evidencia: e.telefono ? "Teléfono publicado" : "Sin teléfono" }) },
          { id: "web", nombre: "Sitio web", peso: 50, evaluar: (e) => {
            if (!e.web) return { valor: 0, evidencia: "Sin enlace web" };
            const red = redes.test(hostDe(e.web));
            return { valor: red ? 0.6 : 1, evidencia: red ? "El enlace web apunta a una red social" : "Enlace a web propia" };
          } },
        ],
      },
    ],
  },

  instagram: {
    nombre: "Instagram",
    apartados: [
      {
        id: "presentacion", nombre: "Presentación", peso: 25,
        criterios: [
          { id: "nombre", nombre: "Nombre visible", peso: 20, evaluar: (e) => ({ valor: e.nombre?.trim() ? 1 : 0, evidencia: e.nombre?.trim() ? "Nombre de perfil definido" : "Sin nombre de perfil" }) },
          { id: "foto", nombre: "Foto de perfil", peso: 20, evaluar: (e) => ({ valor: e.fotoPerfil ? 1 : 0, evidencia: e.fotoPerfil ? "Foto de perfil disponible" : "Sin foto de perfil" }) },
          { id: "bio", nombre: "Biografía", peso: 30, evaluar: (e) => ({ valor: e.bioLongitud > 0 ? 1 : 0, evidencia: e.bioLongitud > 0 ? "Biografía presente" : "Biografía vacía" }) },
          { id: "bio_desarrollada", nombre: "Biografía desarrollada", peso: 30, evaluar: (e) =>
            ({ valor: tramo(e.bioLongitud, [[29, 0], [59, 0.5], [Infinity, 1]]), evidencia: `Biografía de ${e.bioLongitud} caracteres` }) },
        ],
      },
      {
        id: "identificacion", nombre: "Identificación y ubicación", peso: 20,
        criterios: [
          { id: "municipio", nombre: "Menciona la localidad", peso: 60, evaluar: (e) =>
            ({ valor: e.mencionaMunicipio ? 1 : 0, evidencia: e.mencionaMunicipio ? "El nombre o la biografía mencionan la localidad o Granada" : "Ni el nombre ni la biografía mencionan la localidad" }) },
          { id: "direccion", nombre: "Dirección visible", peso: 40, evaluar: (e) =>
            e.direccionEnBio ? { valor: 1, evidencia: "Dirección en la biografía" }
              : { valor: null, evidencia: "No consta en la biografía; la dirección del botón de contacto no es consultable" } },
        ],
      },
      {
        id: "oferta", nombre: "Productos o servicios", peso: 20,
        criterios: [
          { id: "oferta_bio", nombre: "Oferta en la biografía", peso: 50, evaluar: (e) =>
            ({ valor: e.palabrasOfertaBio.length > 0 ? 1 : 0, evidencia: e.palabrasOfertaBio.length ? `Términos de oferta: ${e.palabrasOfertaBio.slice(0, 5).join(", ")}` : "La biografía no menciona productos o servicios del sector" }) },
          { id: "oferta_publicaciones", nombre: "Oferta en publicaciones", peso: 50, evaluar: (e) => {
            if (!e.publicacionesRevisadasOferta) return { valor: null, evidencia: "No hay publicaciones accesibles" };
            const n = e.publicacionesConOferta;
            return { valor: n >= 3 ? 1 : n >= 1 ? 0.5 : 0, evidencia: `${n} de las ${e.publicacionesRevisadasOferta} últimas publicaciones mencionan la oferta` };
          } },
        ],
      },
      {
        id: "actividad", nombre: "Actividad reciente", peso: 20,
        criterios: [
          { id: "ultima", nombre: "Última publicación", peso: 70, evaluar: (e, ctx) => {
            if (e.numPublicaciones === 0) return { valor: 0, evidencia: "El perfil no tiene publicaciones" };
            if (!e.ultimaPublicacion) return { valor: null, evidencia: "No se pudo consultar la fecha de las publicaciones" };
            const d = dias(e.ultimaPublicacion, ctx.ahora);
            return { valor: tramo(d, [[30, 1], [90, 0.7], [180, 0.4], [365, 0.2], [Infinity, 0]]), evidencia: `Última publicación hace ${Math.max(0, Math.round(d))} días` };
          } },
          { id: "constancia", nombre: "Constancia (últimos 90 días)", peso: 30, evaluar: (e) => {
            if (e.numPublicaciones === 0) return { valor: 0, evidencia: "El perfil no tiene publicaciones" };
            if (!e.publicacionesAccesibles) return { valor: null, evidencia: "No se pudo consultar el historial" };
            return { valor: tramo(e.publicaciones90d, [[0, 0], [2, 0.4], [5, 0.7], [Infinity, 1]]), evidencia: `${e.publicaciones90d} publicaciones en 90 días (no se exige publicar a diario)` };
          } },
        ],
      },
      {
        id: "contacto", nombre: "Contacto y reservas", peso: 15,
        criterios: [
          { id: "enlace", nombre: "Enlace en el perfil", peso: 50, evaluar: (e) => ({ valor: e.web ? 1 : 0, evidencia: e.web ? "Enlace en el perfil" : "Sin enlace en el perfil" }) },
          { id: "contacto_bio", nombre: "Vía de contacto o reserva en la biografía", peso: 50, evaluar: (e) =>
            e.contactoEnBio ? { valor: 1, evidencia: "La biografía indica cómo contactar, reservar o pedir" }
              : { valor: null, evidencia: "No consta en la biografía; los botones de contacto no son consultables" } },
        ],
      },
    ],
  },

  // TikTok: rúbrica definida pero NO aplicada hasta disponer de una fuente de datos permitida.
  tiktok: {
    nombre: "TikTok",
    pendiente: true,
    apartados: [
      { id: "presentacion", nombre: "Presentación", peso: 20, criterios: [] },
      { id: "identificacion", nombre: "Identificación del negocio", peso: 20, criterios: [] },
      { id: "actividad", nombre: "Actividad y constancia", peso: 20, criterios: [] },
      { id: "oferta", nombre: "Claridad de la oferta", peso: 25, criterios: [] },
      { id: "contacto", nombre: "Contacto o visita", peso: 15, criterios: [] },
    ],
  },
};

/**
 * Aplica la rúbrica a las evidencias de una plataforma.
 * @returns {{puntuacion:number|null, cobertura:"completa"|"parcial"|"insuficiente", apartados:Array, apartadosComprobados:number, apartadosTotales:number}}
 */
export function puntuar(plataforma, evidencias, ctx) {
  const def = typeof plataforma === "string" ? RUBRICA[plataforma] : plataforma;
  const apartados = def.apartados.map((ap) => {
    const criterios = ap.criterios.map((c) => {
      const r = c.evaluar(evidencias, ctx);
      const valor = r.valor === null || r.valor === undefined ? null : Math.min(1, Math.max(0, r.valor));
      return { id: c.id, nombre: c.nombre, peso: c.peso, valor, noAplica: !!r.noAplica, evidencia: r.evidencia };
    });
    const pesoTotal = criterios.reduce((s, c) => s + c.peso, 0);
    const comprobados = criterios.filter((c) => c.valor !== null);
    const pesoComprobado = comprobados.reduce((s, c) => s + c.peso, 0);
    // Los subcriterios que no aplican (p. ej., por sector) no reducen la cobertura del apartado.
    const pesoAplicable = criterios.filter((c) => !c.noAplica).reduce((s, c) => s + c.peso, 0);
    const suficiente = pesoAplicable > 0 && pesoComprobado / pesoAplicable >= MIN_COBERTURA_APARTADO;
    const puntuacion = suficiente ? Math.round((100 * comprobados.reduce((s, c) => s + c.peso * c.valor, 0)) / pesoComprobado) : null;
    return { id: ap.id, nombre: ap.nombre, peso: ap.peso, puntuacion, criterios, pesoTotal };
  });
  const ponderados = apartados.filter((a) => a.peso > 0);
  const pesoTotal = ponderados.reduce((s, a) => s + a.peso, 0);
  const conDatos = ponderados.filter((a) => a.puntuacion !== null);
  const pesoConDatos = conDatos.reduce((s, a) => s + a.peso, 0);
  const coberturaPeso = pesoTotal ? pesoConDatos / pesoTotal : 0;
  const puntuacion = coberturaPeso >= MIN_COBERTURA_PLATAFORMA
    ? Math.round(conDatos.reduce((s, a) => s + a.peso * a.puntuacion, 0) / pesoConDatos)
    : null;
  const comprobados = apartados.filter((a) => a.puntuacion !== null).length;
  const cobertura = puntuacion === null ? "insuficiente" : comprobados === apartados.length ? "completa" : "parcial";
  return { puntuacion, cobertura, coberturaPeso: Math.round(coberturaPeso * 100), apartados, apartadosComprobados: comprobados, apartadosTotales: apartados.length };
}

/** Versión pública de la rúbrica (sin funciones) para documentación y para el endpoint /api/rubrica. */
export function rubricaPublica() {
  const out = { version: RUBRICA_VERSION, coberturaMinimaPlataforma: MIN_COBERTURA_PLATAFORMA, coberturaMinimaApartado: MIN_COBERTURA_APARTADO, plataformas: {} };
  for (const [k, p] of Object.entries(RUBRICA)) {
    if (p.pendiente) continue; // las plataformas pendientes no se publican
    out.plataformas[k] = {
      nombre: p.nombre, pendiente: !!p.pendiente,
      apartados: p.apartados.map((a) => ({ id: a.id, nombre: a.nombre, peso: a.peso, criterios: a.criterios.map((c) => ({ id: c.id, nombre: c.nombre, peso: c.peso })) })),
    };
  }
  return out;
}
