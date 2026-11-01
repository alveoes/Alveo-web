// Construcción del enlace de WhatsApp. Solo se abre cuando el visitante pulsa el botón.
export const WHATSAPP_BASE = "https://wa.me/34642018865";

const NOMBRES = { google: "Google", instagram: "Instagram", tiktok: "TikTok" };

export function mensajeWhatsApp({ negocio, municipio, resultados = [] }) {
  let texto = `Hola, soy de ${negocio}, en ${municipio}. He utilizado el analizador de ALVEO y me gustaría saber cómo mejorar mis puntuaciones.`;
  const puntuaciones = resultados
    .filter((r) => r.estado === "analizado" && typeof r.puntuacion === "number")
    .map((r) => `${NOMBRES[r.plataforma] ?? r.plataforma} ${r.puntuacion}/100`);
  if (puntuaciones.length) texto += ` Mis puntuaciones: ${puntuaciones.join(", ")}.`;
  return texto;
}

export function enlaceWhatsApp(analisis) {
  return `${WHATSAPP_BASE}?text=${encodeURIComponent(mensajeWhatsApp(analisis))}`;
}
