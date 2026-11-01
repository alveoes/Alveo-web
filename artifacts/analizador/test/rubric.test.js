import { test } from "node:test";
import assert from "node:assert/strict";
import { puntuar, RUBRICA, rubricaPublica } from "../src/rubric.js";
import { reducirEvidencias as evGoogle } from "../src/platforms/google.js";
import { reducirEvidencias as evInstagram } from "../src/platforms/instagram.js";
import { AHORA, googleCompleto, googleMinimo, instagramCompleto, instagramVacio } from "./fixtures/fixtures.js";

const ap = (r, id) => r.apartados.find((a) => a.id === id);

test("los pesos ponderados de cada plataforma suman 100", () => {
  for (const [k, p] of Object.entries(RUBRICA)) {
    assert.equal(p.apartados.reduce((s, a) => s + a.peso, 0), 100, k);
  }
  assert.equal(rubricaPublica().plataformas.tiktok.pendiente, true);
});

test("Google: cálculo completo coincide con el cálculo manual", () => {
  const e = evGoogle(googleCompleto);
  assert.equal(e.resenasEnMuestra, 2);
  assert.ok(!JSON.stringify(e).includes("texto que no se guarda"), "no se conservan textos de reseñas");
  assert.ok(!JSON.stringify(e).includes("Persona"), "no se conservan autores de reseñas");
  const r = puntuar("google", e, { ahora: AHORA, hosteleria: true });
  assert.equal(ap(r, "completitud").puntuacion, 100);
  assert.equal(ap(r, "horarios").puntuacion, 100);
  assert.equal(ap(r, "categoria_servicios").puntuacion, 100);
  assert.equal(ap(r, "fotos").puntuacion, 100);
  // Reseñas: 40·(4,5−3)/1,8 + 35·1 + 25·1 = 93,33 → 93
  assert.equal(ap(r, "resenas").puntuacion, 93);
  assert.equal(ap(r, "respuestas").puntuacion, null, "respuestas del propietario: datos insuficientes");
  assert.equal(ap(r, "contacto").puntuacion, 100);
  // Global: (10·100 + 15·100 + 10·100 + 15·100 + 30·93 + 20·100) / 100 = 97,9 → 98
  assert.equal(r.puntuacion, 98);
  assert.equal(r.cobertura, "parcial");
  assert.equal(r.apartadosComprobados, 6);
  assert.equal(r.apartadosTotales, 7);
});

test("Google: datos ausentes no se convierten en ceros inventados", () => {
  const e = evGoogle(googleMinimo);
  const r = puntuar("google", e, { ahora: AHORA, hosteleria: false });
  const comp = ap(r, "completitud").criterios.find((c) => c.id === "direccion");
  assert.equal(comp.valor, null, "sin calle: no se penaliza (puede ser negocio sin local)");
  const cat = ap(r, "categoria_servicios");
  assert.equal(cat.criterios.find((c) => c.id === "atributos_hosteleria").noAplica, true);
  assert.equal(cat.puntuacion, 18); // 60·0,3 / 100
  const res = ap(r, "resenas");
  assert.equal(res.criterios.find((c) => c.id === "valoracion").noAplica, true, "sin reseñas no hay valoración que puntuar");
  assert.equal(res.puntuacion, 0, "cero reseñas es un dato comprobado");
  assert.equal(r.puntuacion, 4); // (10·20 + 10·18) / 100 = 3,8
});

test("Google: actualidad de reseñas solo se confirma, nunca se penaliza por la muestra", () => {
  const e = { ...evGoogle(googleCompleto), resenaMasReciente: new Date(AHORA - 500 * 86400000).toISOString() };
  const r = puntuar("google", e, { ahora: AHORA, hosteleria: true });
  assert.equal(ap(r, "resenas").criterios.find((c) => c.id === "actualidad").valor, null);
  assert.equal(ap(r, "resenas").puntuacion, Math.round((40 * (1.5 / 1.8) + 35) / 75 * 100));
});

test("Instagram: perfil completo", () => {
  const e = evInstagram(instagramCompleto, { sector: "restauracion", sectorOtro: "", municipio: "Granada", ahora: AHORA });
  assert.equal(e.mencionaMunicipio, true);
  assert.equal(e.direccionEnBio, true);
  assert.equal(e.contactoEnBio, true);
  assert.equal(e.publicaciones90d, 4);
  const r = puntuar("instagram", e, { ahora: AHORA });
  assert.equal(ap(r, "presentacion").puntuacion, 100);
  assert.equal(ap(r, "identificacion").puntuacion, 100);
  assert.equal(ap(r, "contacto").puntuacion, 100);
  // Oferta: bio sí (50) + 3 de 5 publicaciones mencionan oferta (menú, tapas, terraza, carta → 4) → 100
  assert.equal(ap(r, "oferta").puntuacion, 100);
  // Actividad: última hace 3 días (70·1) + 4 publicaciones en 90 días (30·0,7) = 91
  assert.equal(ap(r, "actividad").puntuacion, 91);
  assert.equal(r.cobertura, "completa");
  assert.equal(r.puntuacion, Math.round((25 * 100 + 20 * 100 + 20 * 100 + 20 * 91 + 15 * 100) / 100));
});

test("Instagram: lo no consultable queda como datos insuficientes, no como fallo", () => {
  const e = evInstagram(instagramVacio, { sector: "otro", sectorOtro: "bicicletas", municipio: "Loja", ahora: AHORA });
  const r = puntuar("instagram", e, { ahora: AHORA });
  const ident = ap(r, "identificacion");
  assert.equal(ident.criterios.find((c) => c.id === "direccion").valor, null);
  assert.equal(ident.puntuacion, 0, "municipio no mencionado: comprobado");
  const contacto = ap(r, "contacto");
  assert.equal(contacto.criterios.find((c) => c.id === "contacto_bio").valor, null);
  assert.equal(contacto.puntuacion, 0, "sin enlace (comprobado); botones no consultables excluidos");
  assert.equal(ap(r, "actividad").puntuacion, 0, "perfil sin publicaciones: comprobado");
  assert.equal(r.puntuacion, 0);
});

test("cobertura mínima: sin 60 % del peso comprobado no hay puntuación global", () => {
  const def = { apartados: [
    { id: "a", nombre: "A", peso: 50, criterios: [{ id: "x", nombre: "x", peso: 1, evaluar: () => ({ valor: 1, evidencia: "" }) }] },
    { id: "b", nombre: "B", peso: 50, criterios: [{ id: "y", nombre: "y", peso: 1, evaluar: () => ({ valor: null, evidencia: "" }) }] },
  ] };
  const r = puntuar(def, {}, {});
  assert.equal(r.puntuacion, null);
  assert.equal(r.cobertura, "insuficiente");
  assert.equal(r.apartados[0].puntuacion, 100, "los apartados con datos se siguen mostrando");
  def.apartados[0].peso = 60; def.apartados[1].peso = 40;
  assert.equal(puntuar(def, {}, {}).puntuacion, 100);
});
