import { test } from "node:test";
import assert from "node:assert/strict";
import { enlaceWhatsApp, mensajeWhatsApp } from "../public/js/whatsapp.js";

test("mensaje base con nombre y municipio, sin puntuaciones si no hay análisis real", () => {
  const a = { negocio: "Bar Paco & Hijos", municipio: "Huétor Vega", resultados: [{ plataforma: "google", estado: "no_analizado" }, { plataforma: "tiktok", estado: "sin_perfil" }] };
  assert.equal(mensajeWhatsApp(a), "Hola, soy de Bar Paco & Hijos, en Huétor Vega. He utilizado el analizador de ALVEO y me gustaría saber cómo mejorar mis puntuaciones.");
});

test("incluye solo puntuaciones reales y codifica correctamente el enlace", () => {
  const a = { negocio: "Bar Paco & Hijos", municipio: "Granada", resultados: [
    { plataforma: "google", estado: "analizado", puntuacion: 72 },
    { plataforma: "instagram", estado: "analizado", puntuacion: null },
    { plataforma: "tiktok", estado: "no_analizado" },
  ] };
  const url = enlaceWhatsApp(a);
  assert.ok(url.startsWith("https://wa.me/34642018865?text="));
  const texto = new URL(url).searchParams.get("text");
  assert.equal(texto, "Hola, soy de Bar Paco & Hijos, en Granada. He utilizado el analizador de ALVEO y me gustaría saber cómo mejorar mis puntuaciones. Mis puntuaciones: Google 72/100.");
  assert.ok(!url.includes(" ") && !url.includes("&H"), "espacios y & codificados");
});
