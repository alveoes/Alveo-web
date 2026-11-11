/**
 * Conexión opcional con Google PageSpeed Insights (Lighthouse, móvil).
 * Se activa definiendo la variable de entorno PAGESPEED_API_KEY.
 * Sin clave devuelve { available: false } y la web lo indica claramente.
 */
import { logger } from "./logger";

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const TIMEOUT_MS = 60_000;
const CACHE_MS = 15 * 60_000;

export interface Metric {
  label: string;
  value: string;
  /** Valoración de Google para esta métrica: bueno / mejorable / lento. */
  rating: "good" | "average" | "poor" | null;
}

export type PageSpeedResult =
  | {
      available: true;
      performanceScore: number; // 0-100, tal cual lo da Google
      metrics: Metric[];
      fieldData: { overall: "FAST" | "AVERAGE" | "SLOW" | null; lcpMs: number | null } | null;
      opportunities: { title: string; savingsMs: number }[];
      reportUrl: string;
    }
  | { available: false; reason: "not_configured" | "failed"; message: string };

const cache = new Map<string, { at: number; result: PageSpeedResult }>();

export const pageSpeedConfigured = () => Boolean(process.env.PAGESPEED_API_KEY);

function rate(score: number | null | undefined): Metric["rating"] {
  if (score == null) return null;
  if (score >= 0.9) return "good";
  if (score >= 0.5) return "average";
  return "poor";
}

export async function runPageSpeed(url: string): Promise<PageSpeedResult> {
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) {
    return {
      available: false,
      reason: "not_configured",
      message: "La medición de velocidad con Google PageSpeed Insights todavía no está activada en esta herramienta.",
    };
  }
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;

  const qs = new URLSearchParams({ url, strategy: "mobile", category: "performance", locale: "es" });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}?${qs}`, {
      signal: controller.signal,
      headers: { "X-Goog-Api-Key": key },
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "PageSpeed request failed");
      return {
        available: false,
        reason: "failed",
        message:
          res.status === 429
            ? "Google PageSpeed Insights ha alcanzado su límite de consultas. Inténtalo más tarde."
            : "Google PageSpeed Insights no pudo analizar esta web ahora mismo.",
      };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const lh = data.lighthouseResult;
    const score = lh?.categories?.performance?.score;
    if (typeof score !== "number") {
      return { available: false, reason: "failed", message: "Google PageSpeed Insights no devolvió una puntuación para esta web." };
    }
    const a = lh.audits ?? {};
    const metric = (id: string, label: string): Metric | null =>
      a[id]?.displayValue ? { label, value: a[id].displayValue, rating: rate(a[id].score) } : null;
    const metrics = [
      metric("first-contentful-paint", "Primer contenido visible"),
      metric("largest-contentful-paint", "Carga del contenido principal (LCP)"),
      metric("total-blocking-time", "Tiempo bloqueado (TBT)"),
      metric("cumulative-layout-shift", "Estabilidad visual (CLS)"),
      metric("speed-index", "Índice de velocidad"),
    ].filter((m): m is Metric => m !== null);

    const opportunities = Object.values(a)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((x: any) => x?.details?.type === "opportunity" && x.details.overallSavingsMs > 300)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((x: any) => ({ title: String(x.title), savingsMs: Math.round(x.details.overallSavingsMs) }))
      .sort((x, y) => y.savingsMs - x.savingsMs)
      .slice(0, 3);

    const le = data.loadingExperience;
    const fieldData =
      le?.metrics && le.origin_fallback !== true
        ? {
            overall: le.overall_category ?? null,
            lcpMs: le.metrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null,
          }
        : null;

    const result: PageSpeedResult = {
      available: true,
      performanceScore: Math.round(score * 100),
      metrics,
      fieldData,
      opportunities,
      reportUrl: `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&form_factor=mobile`,
    };
    cache.set(url, { at: Date.now(), result });
    return result;
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "PageSpeed error");
    return {
      available: false,
      reason: "failed",
      message: "Google PageSpeed Insights tardó demasiado o no respondió. La velocidad no se ha podido medir esta vez.",
    };
  } finally {
    clearTimeout(timer);
  }
}
