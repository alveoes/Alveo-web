import { enlaceWhatsApp } from "./whatsapp.js";

// Se ajusta con /api/opciones: solo las plataformas públicas.
let PLATAFORMAS = ["google", "instagram"];
const NOMBRES = { google: "Google", instagram: "Instagram" };
// Comprobación rápida en el navegador; la validación definitiva la hace el servidor.
const PATRONES = {
  google: /^(https?:\/\/)?((www\.)?google\.(com|es)\/maps|maps\.google\.(com|es)\/|maps\.app\.goo\.gl\/|goo\.gl\/maps\/|g\.page\/|share\.google\/|g\.co\/kgs\/)/i,
  instagram: /^(@[A-Za-z0-9._]{1,30}$|(https?:\/\/)?((www|m)\.)?instagram\.com\/[A-Za-z0-9._]{1,30}\/?(\?.*)?$)/i,
};
const MENSAJES_FORMATO = {
  google: "El enlace debe ser de Google Maps (por ejemplo, https://maps.app.goo.gl/…).",
  instagram: "El enlace debe ser de tu perfil de Instagram (por ejemplo, https://www.instagram.com/tunegocio/).",
};

const $ = (sel) => document.querySelector(sel);
const form = $("#form-analisis");
const fechaLarga = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" });

function el(tag, attrs = {}, ...hijos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else n.setAttribute(k, v);
  }
  for (const h of hijos) if (h !== null && h !== undefined) n.append(h);
  return n;
}

// ---------- Carga de opciones ----------
async function cargarOpciones() {
  try {
    const r = await fetch("api/opciones", { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error();
    const o = await r.json();
    PLATAFORMAS = PLATAFORMAS.filter((p) => o.plataformas.includes(p));
    for (const fs of document.querySelectorAll("[data-plataforma]")) if (!PLATAFORMAS.includes(fs.dataset.plataforma)) fs.remove();
    const sector = $("#sector");
    for (const s of o.sectores) sector.append(el("option", { value: s.id, text: s.nombre }));
    const muni = $("#municipio");
    muni.append(el("option", { value: "Granada", text: "Granada (capital)" }));
    for (const m of o.municipios) if (m !== "Granada") muni.append(el("option", { value: m, text: m }));
    $("#version-rubrica").textContent = o.rubrica;
    const avisos = {
      sin_configurar: "Análisis no disponible temporalmente: puedes añadir el enlace, pero ahora mismo no podremos puntuarlo.",
    };
    for (const p of PLATAFORMAS) {
      const aviso = avisos[o.integraciones[p]];
      const nodo = document.querySelector(`[data-estado-para="${p}"]`);
      if (aviso && nodo) { nodo.textContent = aviso; nodo.hidden = false; }
    }
  } catch {
    mostrarErrorGeneral("No se ha podido cargar el formulario. Recarga la página.");
  }
}

// ---------- Formulario ----------
$("#sector").addEventListener("change", (e) => {
  const otro = e.target.value === "otro";
  $("#campo-sector-otro").hidden = !otro;
  $("#sectorOtro").required = otro;
});

for (const cb of document.querySelectorAll("[data-sin-perfil]")) {
  cb.addEventListener("change", () => {
    const p = cb.dataset.sinPerfil;
    const input = $(`#enlace-${p}`);
    input.disabled = cb.checked;
    if (cb.checked) { input.value = ""; ponerError(p, null); }
  });
}

function ponerError(campo, mensaje) {
  const nodo = $(`#err-${campo}`);
  const input = campo in PATRONES ? $(`#enlace-${campo}`) : $(`#${campo}`);
  if (!nodo) return;
  nodo.textContent = mensaje ?? "";
  nodo.hidden = !mensaje;
  if (input) input.setAttribute("aria-invalid", mensaje ? "true" : "false");
}

function mostrarErrorGeneral(m) {
  const n = $("#error-general");
  n.textContent = m ?? "";
  n.hidden = !m;
}

function leerFormulario() {
  const datos = {
    negocio: $("#negocio").value.trim(),
    sector: $("#sector").value,
    sectorOtro: $("#sectorOtro").value.trim(),
    municipio: $("#municipio").value,
    enlaces: {},
  };
  for (const p of PLATAFORMAS) {
    const sin = document.querySelector(`[data-sin-perfil="${p}"]`).checked;
    const v = $(`#enlace-${p}`).value.trim();
    datos.enlaces[p] = sin || !v ? null : v;
  }
  return datos;
}

function validarEnCliente(d) {
  const err = {};
  if (d.negocio.length < 2) err.negocio = "Escribe el nombre del negocio.";
  if (!d.sector) err.sector = "Elige un sector.";
  if (d.sector === "otro" && d.sectorOtro.length < 2) err.sectorOtro = "Indica a qué se dedica el negocio.";
  if (!d.municipio) err.municipio = "Elige un municipio de la provincia de Granada.";
  for (const p of PLATAFORMAS) if (d.enlaces[p] && !PATRONES[p].test(d.enlaces[p])) err[p] = MENSAJES_FORMATO[p];
  if (!PLATAFORMAS.some((p) => d.enlaces[p])) err.general = "Añade al menos un enlace válido de Google o Instagram.";
  return err;
}

function mostrarErrores(err) {
  for (const c of ["negocio", "sector", "sectorOtro", "municipio", ...PLATAFORMAS]) ponerError(c, err[c] ?? null);
  mostrarErrorGeneral(err.general ?? (Object.keys(err).length ? "Revisa los campos marcados." : null));
  const primero = ["negocio", "municipio", "sector", "sectorOtro", ...PLATAFORMAS].find((c) => err[c]);
  if (primero) (primero in PATRONES ? $(`#enlace-${primero}`) : $(`#${primero}`)).focus();
  else if (err.general) $("#error-general").scrollIntoView({ block: "center" });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const datos = leerFormulario();
  const err = validarEnCliente(datos);
  mostrarErrores(err);
  if (Object.keys(err).length) return;
  await ejecutarAnalisis(datos);
});

// ---------- Análisis con progreso real (respuesta en streaming) ----------
async function ejecutarAnalisis(datos) {
  const boton = $("#boton-analizar");
  boton.disabled = true;
  boton.textContent = "Analizando…";
  let res;
  try {
    res = await fetch("api/analizar", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify(datos) });
  } catch {
    restaurarBoton();
    return mostrarErrorGeneral("No hemos podido conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.");
  }
  if (!res.ok) {
    restaurarBoton();
    let cuerpo = {};
    try { cuerpo = await res.json(); } catch { /* sin cuerpo */ }
    if (cuerpo.errores) return mostrarErrores(cuerpo.errores);
    return mostrarErrorGeneral(cuerpo.error ?? "No se ha podido iniciar el análisis. Inténtalo de nuevo.");
  }

  prepararProgreso();
  const lector = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = "";
  let terminado = false;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      let i;
      while ((i = buffer.indexOf("\n")) >= 0) {
        const linea = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (!linea) continue;
        const ev = JSON.parse(linea);
        if (ev.tipo === "fin") { terminado = true; mostrarResultados(ev.analisis); }
        else if (ev.tipo === "error") throw new Error(ev.error);
        else manejarEvento(ev);
      }
    }
    if (!terminado) throw new Error("El análisis se interrumpió.");
  } catch (err) {
    $("#progreso").hidden = true;
    restaurarBoton();
    mostrarErrorGeneral(`${err.message || "Se produjo un error"} Inténtalo de nuevo.`);
    $("#formulario").scrollIntoView();
  }
}

function restaurarBoton() {
  const b = $("#boton-analizar");
  b.disabled = false;
  b.textContent = "Analizar mi negocio";
}

const estadoProgreso = { incluidas: 0, terminadas: 0 };

function prepararProgreso() {
  $("#lista-progreso").replaceChildren();
  $("#resultados").hidden = true;
  $("#progreso").hidden = false;
  actualizarBarra(0);
  $("#titulo-progreso").focus();
  $("#progreso").scrollIntoView({ behavior: "smooth", block: "start" });
}

function actualizarBarra(pct) {
  const b = $("#barra-progreso");
  b.setAttribute("aria-valuenow", String(pct));
  b.firstElementChild.style.width = `${pct}%`;
}

function filaProgreso(p) {
  return document.querySelector(`#lista-progreso [data-p="${p}"]`);
}

function manejarEvento(ev) {
  const lista = $("#lista-progreso");
  if (ev.tipo === "inicio") {
    estadoProgreso.incluidas = ev.plataformas.filter((p) => p.incluida).length;
    estadoProgreso.terminadas = 0;
    for (const { plataforma, incluida } of ev.plataformas) {
      lista.append(el("li", { "data-p": plataforma },
        el("span", { class: "icono", "aria-hidden": "true" }, incluida ? el("span", { class: "girando" }) : "–"),
        el("div", {}, el("strong", { text: NOMBRES[plataforma] }), el("span", { class: "texto", text: incluida ? "En espera" : "No incluido" }))));
    }
  } else if (ev.tipo === "paso") {
    const f = filaProgreso(ev.plataforma);
    if (f) f.querySelector(".texto").textContent = ev.texto;
  } else if (ev.tipo === "plataforma") {
    const r = ev.resultado;
    const f = filaProgreso(r.plataforma);
    if (!f || r.estado === "sin_perfil") return;
    estadoProgreso.terminadas++;
    const ok = r.estado === "analizado";
    f.querySelector(".icono").textContent = ok ? "✓" : "✕";
    f.querySelector(".texto").textContent = ok ? "Análisis completado" : "No se ha podido analizar";
    actualizarBarra(Math.round((100 * estadoProgreso.terminadas) / Math.max(1, estadoProgreso.incluidas)));
  }
}

// ---------- Resultados ----------
function nivel(p) {
  if (p >= 80) return "Muy completa";
  if (p >= 60) return "Buena base";
  if (p >= 40) return "Mejorable";
  return "Mucho margen de mejora";
}

function medidor(valor, etiqueta) {
  const relleno = el("span");
  relleno.style.width = `${valor}%`; // CSSOM: compatible con la CSP (sin estilos en línea)
  return el("div", { class: "medidor", role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(valor), "aria-label": etiqueta, "aria-valuetext": `${valor} sobre 100` }, relleno);
}

function tarjeta(r) {
  const t = el("article", { class: "tarjeta", "aria-labelledby": `t-${r.plataforma}` });
  t.append(el("h3", { id: `t-${r.plataforma}`, text: NOMBRES[r.plataforma] }));

  if (r.estado === "sin_perfil") {
    t.classList.add("secundaria");
    t.append(el("p", { class: "estado", text: "No incluido" }), el("p", { class: "motivo", text: "No has añadido este perfil. No resta puntos." }));
    return t;
  }
  if (r.estado === "no_analizado") {
    t.classList.add("secundaria");
    t.append(el("p", { class: "estado", text: "No se ha podido analizar" }), el("p", { class: "motivo", text: r.motivo }));
    return t;
  }
  if (r.perfil?.nombre) {
    t.append(el("p", { class: "perfil", text: `Perfil analizado: ${r.perfil.nombre}${r.perfil.detalle ? ` · ${r.perfil.detalle}` : ""}` }));
  }
  if (typeof r.puntuacion === "number") {
    t.append(
      el("div", { class: "puntuacion" }, el("span", { class: "cifra", text: String(r.puntuacion) }), el("span", { class: "sobre", text: "Puntuación sobre 100" })),
      medidor(r.puntuacion, `Puntuación de ${NOMBRES[r.plataforma]}`),
      el("p", { class: "etiqueta-nivel", text: nivel(r.puntuacion) }),
    );
  } else {
    t.append(el("p", { class: "estado", text: "Datos insuficientes" }), el("p", { class: "motivo", text: "No hemos podido comprobar suficientes apartados para dar una puntuación global." }));
  }
  const cob = r.cobertura === "completa" ? "Cobertura completa" : `Cobertura parcial · ${r.apartadosComprobados} de ${r.apartadosTotales} apartados comprobados`;
  t.append(el("p", { class: "cobertura", text: cob }));

  const lista = el("ul", { class: "apartados", "aria-label": `Apartados de ${NOMBRES[r.plataforma]}` });
  for (const a of r.apartados) {
    const li = el("li", {}, el("span", { text: a.nombre }));
    if (typeof a.puntuacion === "number") {
      li.append(el("span", { class: "valor", text: `${a.puntuacion}/100` }), medidor(a.puntuacion, a.nombre));
    } else {
      li.append(el("span", { class: "sin-datos", text: "Datos insuficientes" }));
    }
    lista.append(li);
  }
  t.append(lista);
  if (r.desdeCache) t.append(el("p", { class: "fecha-datos", text: `Datos consultados el ${fechaLarga.format(new Date(r.fechaDatos))}.` }));
  return t;
}

function mostrarResultados(a) {
  restaurarBoton();
  actualizarBarra(100);
  $("#titulo-resultados").textContent = `${a.negocio} · ${a.municipio}`;
  $("#meta-analisis").textContent = `Fecha del análisis: ${fechaLarga.format(new Date(a.fecha))}`;
  const orden = [...a.resultados].sort((x, y) => PLATAFORMAS.indexOf(x.plataforma) - PLATAFORMAS.indexOf(y.plataforma));
  $("#tarjetas").replaceChildren(...orden.map(tarjeta));
  $("#boton-whatsapp").href = enlaceWhatsApp(a);
  $("#progreso").hidden = true;
  $("#resultados").hidden = false;
  $("#titulo-resultados").focus();
  $("#resultados").scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#boton-nuevo").addEventListener("click", () => {
  $("#resultados").hidden = true;
  $("#formulario").scrollIntoView({ behavior: "smooth" });
  $("#negocio").focus();
});

cargarOpciones();
