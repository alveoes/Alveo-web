import { test } from "node:test";
import assert from "node:assert/strict";
import { validarEntrada } from "../src/analyze.js";

const base = { negocio: "Bar Paco", sector: "restauracion", municipio: "Granada", enlaces: {} };

test("exige al menos un enlace válido", () => {
  const r = validarEntrada({ ...base, enlaces: { instagram: null, tiktok: "", google: null } });
  assert.equal(r.ok, false);
  assert.match(r.errores.general, /al menos un enlace/);
});

test("un enlace inválido muestra error de su campo", () => {
  const r = validarEntrada({ ...base, enlaces: { instagram: "https://evil.com/x" } });
  assert.equal(r.ok, false);
  assert.ok(r.errores.instagram);
  assert.equal(r.errores.general, undefined);
});

test("valida sector, «Otro», municipio y nombre", () => {
  const r = validarEntrada({ negocio: "x", sector: "inventado", municipio: "Madrid", enlaces: { instagram: "@bar" } });
  assert.deepEqual(Object.keys(r.errores).sort(), ["municipio", "negocio", "sector"]);
  const o = validarEntrada({ ...base, sector: "otro", enlaces: { instagram: "@bar" } });
  assert.ok(o.errores.sectorOtro);
  const ok = validarEntrada({ ...base, sector: "otro", sectorOtro: "Bicicletas", municipio: "La Zubia", enlaces: { instagram: "@bar" } });
  assert.equal(ok.ok, true);
});

test("limpia el texto y acepta entradas correctas", () => {
  const r = validarEntrada({ ...base, negocio: "  Bar <b>Paco</b>\n ", enlaces: { google: "https://maps.app.goo.gl/AbCdEf123", tiktok: "@barpaco" } });
  assert.equal(r.ok, true);
  assert.equal(r.datos.negocio, "Bar bPaco/b");
  assert.equal(r.datos.enlaces.instagram, null);
  assert.equal(r.datos.enlaces.google.corto, true);
});

test("rechaza cuerpos que no son objetos", () => {
  assert.equal(validarEntrada(null).ok, false);
  assert.equal(validarEntrada("hola").ok, false);
});
