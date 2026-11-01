import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverEnlaceCorto } from "../src/safe-fetch.js";

const redir = (mapa) => async (url, opts) => {
  assert.equal(opts.redirect, "manual");
  const loc = mapa[url];
  if (!loc) return new Response("ok", { status: 200 });
  return new Response(null, { status: 302, headers: { location: loc } });
};

test("resuelve un enlace corto hasta la URL de Maps sin descargarla", async () => {
  const destino = "https://www.google.com/maps/place/Bar+Paco/data=!1s0x1:0xabc";
  const llamadas = [];
  const f = redir({ "https://maps.app.goo.gl/abc12": destino });
  const r = await resolverEnlaceCorto("https://maps.app.goo.gl/abc12", { fetchImpl: (u, o) => { llamadas.push(u); return f(u, o); } });
  assert.equal(r, destino);
  assert.deepEqual(llamadas, ["https://maps.app.goo.gl/abc12"]);
});

test("sigue la página de consentimiento a través de ?continue=", async () => {
  const destino = "https://www.google.com/maps/place/Bar+Paco";
  const consent = `https://consent.google.com/m?continue=${encodeURIComponent(destino)}`;
  assert.equal(await resolverEnlaceCorto("https://maps.app.goo.gl/abc12", { fetchImpl: redir({ "https://maps.app.goo.gl/abc12": consent }) }), destino);
});

test("rechaza redirecciones a dominios ajenos, a HTTP o a IPs internas", async () => {
  for (const malo of ["https://evil.com/maps/place/x", "http://www.google.com/maps/place/x", "https://169.254.169.254/", "https://consent.google.com/m?continue=https://evil.com/"]) {
    await assert.rejects(resolverEnlaceCorto("https://maps.app.goo.gl/abc12", { fetchImpl: redir({ "https://maps.app.goo.gl/abc12": malo }) }), /no permitida/i, malo);
  }
});

test("limita el número de saltos y falla si no hay redirección", async () => {
  const bucle = { "https://maps.app.goo.gl/a": "https://g.page/b", "https://g.page/b": "https://maps.app.goo.gl/a" };
  await assert.rejects(resolverEnlaceCorto("https://maps.app.goo.gl/a", { fetchImpl: redir(bucle) }), /Demasiadas/);
  await assert.rejects(resolverEnlaceCorto("https://maps.app.goo.gl/a", { fetchImpl: redir({}) }), /no redirige/);
});
