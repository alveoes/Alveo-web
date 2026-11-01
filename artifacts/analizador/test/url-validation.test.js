import { test } from "node:test";
import assert from "node:assert/strict";
import { validarInstagram, validarTiktok, validarGoogle, interpretarUrlMaps, esRedireccionGoogleSegura } from "../src/url-validation.js";

test("Instagram: acepta perfiles válidos y normaliza", () => {
  for (const [entrada, usuario] of [
    ["https://www.instagram.com/Bar.Paco_GR/", "bar.paco_gr"],
    ["instagram.com/barpaco", "barpaco"],
    ["https://instagram.com/barpaco?igsh=abc123", "barpaco"],
    ["http://m.instagram.com/barpaco", "barpaco"],
    ["@barpaco", "barpaco"],
  ]) {
    const r = validarInstagram(entrada);
    assert.equal(r.ok, true, entrada);
    assert.equal(r.usuario, usuario);
    assert.equal(r.url, `https://www.instagram.com/${usuario}/`);
  }
});

test("Instagram: rechaza dominios ajenos, publicaciones y URLs maliciosas", () => {
  for (const e of [
    "https://instagram.com.evil.com/barpaco", "https://evil.com/instagram.com/barpaco", "https://instagram.com@evil.com/barpaco",
    "javascript:alert(1)", "https://www.instagram.com/p/Cxyz123/", "https://www.instagram.com/reel/abc/", "https://www.instagram.com/",
    "https://user:pass@instagram.com/barpaco", "https://instagram.com:8443/barpaco", "ftp://instagram.com/barpaco",
    "https://www.instagram.com/bar<script>/", "", "   ", "a".repeat(700), "https://www.instagram.com/.barpaco/",
  ]) assert.equal(validarInstagram(e).ok, false, e);
});

test("TikTok: perfiles válidos, enlaces cortos y rechazos", () => {
  assert.deepEqual(validarTiktok("https://www.tiktok.com/@BarPaco?lang=es"), { ok: true, usuario: "barpaco", url: "https://www.tiktok.com/@barpaco", corto: false });
  assert.equal(validarTiktok("@barpaco").ok, true);
  assert.equal(validarTiktok("https://vm.tiktok.com/ZMabc123/").corto, true);
  for (const e of ["https://www.tiktok.com/barpaco", "https://tiktok.com.evil.io/@barpaco", "https://www.tiktok.com/@b", "https://vm.tiktok.com/../../etc"]) {
    assert.equal(validarTiktok(e).ok, false, e);
  }
});

test("Google: enlaces cortos y completos válidos", () => {
  assert.deepEqual(validarGoogle("https://maps.app.goo.gl/AbCdEf123"), { ok: true, url: "https://maps.app.goo.gl/AbCdEf123", corto: true });
  assert.equal(validarGoogle("https://share.google/AbCdEf123").ok, true);
  assert.equal(validarGoogle("https://goo.gl/maps/AbCdEf123").ok, true);
  const largo = "https://www.google.com/maps/place/Bar+Paco/@37.1761,-3.5976,17z/data=!4m6!3m5!1s0xd71fcb8a1b2c3d4:0x1a2b3c4d5e6f7a8b!8m2!3d37.17612!4d-3.59761";
  assert.equal(validarGoogle(largo).ok, true);
  assert.equal(validarGoogle("https://maps.google.com/?cid=1234567890123").ok, true);
});

test("Google: rechaza dominios ajenos y enlaces que no identifican un negocio", () => {
  for (const e of [
    "https://goo.gl/abc123", "https://www.google.com/search?q=bar", "https://maps.app.goo.gl.evil.com/abc", "https://evil.com/maps/place/x",
    "https://www.google.com/maps/@37.17,-3.59,15z", "https://www.google.com.evil.com/maps/place/x", "https://g.co/abc", "file:///etc/passwd",
  ]) assert.equal(validarGoogle(e).ok, false, e);
});

test("interpretarUrlMaps extrae CID (desde ftid hex), coordenadas exactas, nombre y place_id", () => {
  const d = interpretarUrlMaps("https://www.google.com/maps/place/Bar+Paco/@37.1,-3.5,17z/data=!3m1!4b1!4m6!3m5!1s0xd71fcb8a1b2c3d4:0x1a2b3c4d5e6f7a8b!8m2!3d37.17612!4d-3.59761");
  assert.equal(d.nombre, "Bar Paco");
  assert.equal(d.cid, BigInt("0x1a2b3c4d5e6f7a8b").toString());
  assert.equal(d.lat, 37.17612);
  assert.equal(d.lng, -3.59761);
  assert.equal(interpretarUrlMaps("https://www.google.com/maps/search/?api=1&query=x&query_place_id=ChIJabcdefghijklmnop").placeId, "ChIJabcdefghijklmnop");
  assert.equal(interpretarUrlMaps("https://maps.google.com/?cid=987654321").cid, "987654321");
});

test("Redirecciones: solo HTTPS y dominios de Google", () => {
  assert.equal(esRedireccionGoogleSegura("https://www.google.com/maps/place/x"), true);
  assert.equal(esRedireccionGoogleSegura("http://www.google.com/maps/place/x"), false);
  assert.equal(esRedireccionGoogleSegura("https://evil.com/maps"), false);
  assert.equal(esRedireccionGoogleSegura("https://169.254.169.254/latest"), false);
  assert.equal(esRedireccionGoogleSegura("https://www.google.com:8080/maps"), false);
});
