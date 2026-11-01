// Configuración leída exclusivamente de variables de entorno del servidor.
// Ninguna clave se envía nunca al navegador.

function int(name, def) {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) && v >= 0 ? v : def;
}

const isTest = process.env.NODE_ENV === "test";

export const config = {
  port: int("PORT", 8090),
  basePath: (process.env.BASE_PATH || "/analiza-tu-negocio").replace(/\/+$/, ""),
  // Solo activar si el servidor está detrás de un proxy de confianza (Replit, Nginx, Cloudflare...).
  trustProxy: process.env.TRUST_PROXY === "1",

  google: {
    apiKey: process.env.GOOGLE_PLACES_API_KEY || "",
    // Solo en tests se permite apuntar a un servidor simulado local.
    baseUrl: isTest && process.env.TEST_GOOGLE_BASE_URL ? process.env.TEST_GOOGLE_BASE_URL : "https://places.googleapis.com",
    // Tope diario de análisis de Google NO cacheados (cada uno = 1 Text Search + 1 Place Details).
    dailyBudget: int("GOOGLE_DAILY_BUDGET", 30),
  },

  instagram: {
    // ID de la cuenta profesional de Instagram de ALVEO (IG User ID) y token de larga duración.
    igUserId: process.env.META_IG_USER_ID || "",
    accessToken: process.env.META_ACCESS_TOKEN || "",
    graphVersion: process.env.META_GRAPH_VERSION || "v25.0",
    baseUrl: isTest && process.env.TEST_META_BASE_URL ? process.env.TEST_META_BASE_URL : "https://graph.facebook.com",
    dailyBudget: int("INSTAGRAM_DAILY_BUDGET", 150),
  },

  cacheTtlMs: int("CACHE_TTL_HOURS", 24) * 3600 * 1000,
  cacheMaxEntries: int("CACHE_MAX_ENTRIES", 500),

  rateLimit: {
    // Análisis por IP: ventana corta y diaria. La IP solo se guarda en memoria, como hash.
    shortWindowMs: 10 * 60 * 1000,
    shortMax: int("RATE_LIMIT_10MIN", 5),
    dailyMax: int("RATE_LIMIT_DAILY", 20),
    // Máximo de análisis simultáneos en todo el servidor.
    maxConcurrent: int("MAX_CONCURRENT_ANALYSES", 4),
  },

  requestTimeoutMs: int("UPSTREAM_TIMEOUT_MS", 8000),

  audit: {
    enabled: process.env.AUDIT_LOG !== "0",
    file: process.env.AUDIT_LOG_FILE || new URL("../data/analisis.jsonl", import.meta.url).pathname,
    retentionDays: int("AUDIT_RETENTION_DAYS", 365),
  },

  whatsappNumber: "34642018865",
};

// Plataformas visibles para el público. TikTok queda oculto hasta tener una fuente de datos permitida.
export const PLATAFORMAS_PUBLICAS = ["google", "instagram"];

export function integrationStatus() {
  return {
    google: config.google.apiKey ? "activa" : "sin_configurar",
    instagram: config.instagram.igUserId && config.instagram.accessToken ? "activa" : "sin_configurar",
  };
}
