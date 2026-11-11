/**
 * Límites de uso en memoria (suficiente para una instancia; si se escala a
 * varias instancias cada una aplica su propio límite).
 */
import type { Request, Response, NextFunction } from "express";

interface Window {
  limit: number;
  ms: number;
}

const WINDOWS: Window[] = [
  { limit: Number(process.env.ANALYZE_LIMIT_PER_10MIN ?? 5), ms: 10 * 60_000 },
  { limit: Number(process.env.ANALYZE_LIMIT_PER_DAY ?? 25), ms: 24 * 60 * 60_000 },
];
const MAX_CONCURRENT = Number(process.env.ANALYZE_MAX_CONCURRENT ?? 4);

const hits = new Map<string, number[]>();
let active = 0;

setInterval(() => {
  const cutoff = Date.now() - WINDOWS[WINDOWS.length - 1].ms;
  for (const [key, times] of hits) {
    const kept = times.filter((t) => t > cutoff);
    if (kept.length) hits.set(key, kept);
    else hits.delete(key);
  }
}, 10 * 60_000).unref();

export function analyzeRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const times = hits.get(key) ?? [];
  for (const w of WINDOWS) {
    const inWindow = times.filter((t) => t > now - w.ms);
    if (inWindow.length >= w.limit) {
      const retry = Math.ceil((inWindow[0] + w.ms - now) / 1000);
      res.setHeader("Retry-After", String(retry));
      res.status(429).json({
        error: "rate_limited",
        message:
          w.ms > 3_600_000
            ? "Has alcanzado el máximo de análisis gratuitos por hoy. Vuelve mañana o solicita tu auditoría gratuita con ALVEO."
            : `Has hecho varios análisis seguidos. Espera ${Math.ceil(retry / 60)} min y vuelve a intentarlo.`,
      });
      return;
    }
  }
  if (active >= MAX_CONCURRENT) {
    res.setHeader("Retry-After", "20");
    res.status(503).json({
      error: "busy",
      message: "Ahora mismo hay muchos análisis en marcha. Inténtalo de nuevo en unos segundos.",
    });
    return;
  }
  times.push(now);
  hits.set(key, times);
  active++;
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      active--;
    }
  };
  res.on("finish", release);
  res.on("close", release);
  next();
}
