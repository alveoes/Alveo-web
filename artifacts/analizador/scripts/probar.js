// Prueba un análisis REAL desde la terminal y muestra puntuaciones y evidencias internas.
// Uso:
//   node scripts/probar.js --negocio "Nombre" --sector restauracion --municipio Granada \
//        [--google "https://maps.app.goo.gl/…"] [--instagram "@usuario"]
// Requiere las variables de entorno con las claves (GOOGLE_PLACES_API_KEY, META_*).
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith("--") ? [...acc, [v.slice(2), a[i + 1]]] : acc), []));
process.env.AUDIT_LOG_FILE = join(mkdtempSync(join(tmpdir(), "alveo-prueba-")), "analisis.jsonl");
const { validarEntrada, analizar } = await import("../src/analyze.js");

const v = validarEntrada({
  negocio: args.negocio, sector: args.sector ?? "otro", sectorOtro: args.sectorOtro ?? (args.sector ? "" : "negocio local"),
  municipio: args.municipio ?? "Granada", enlaces: { google: args.google ?? null, instagram: args.instagram ?? null },
});
if (!v.ok) { console.error("Entrada no válida:", v.errores); process.exit(1); }

await analizar(v.datos, (ev) => {
  if (ev.tipo === "paso") console.log(`  · [${ev.plataforma}] ${ev.texto}`);
});
const reg = JSON.parse(readFileSync(process.env.AUDIT_LOG_FILE, "utf8").trim().split("\n").at(-1));
for (const r of reg.resultados) {
  console.log(`\n=== ${r.plataforma.toUpperCase()} · ${r.estado}${r.motivo ? ` · ${r.motivo}` : ""}`);
  if (r.estado !== "analizado") continue;
  console.log(`Puntuación: ${r.puntuacion ?? "Datos insuficientes"}/100 · cobertura ${r.cobertura} · identificación: ${r.metodoIdentificacion ?? "-"}`);
  for (const a of r.criterios) {
    console.log(`\n  ${a.nombre} (peso ${a.peso}): ${a.puntuacion ?? "Datos insuficientes"}`);
    for (const c of a.criterios) console.log(`     - ${c.nombre}: ${c.noAplica ? "no aplica" : c.valor === null ? "sin datos" : c.valor.toFixed(2)} · ${c.evidencia}`);
  }
  console.log("\n  Evidencias:", JSON.stringify(r.evidencias, null, 2).replace(/\n/g, "\n  "));
}
