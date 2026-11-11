import { Router, type IRouter } from "express";
import { analyzeRateLimit } from "../lib/rate-limit";
import { normalizeUserUrl, safeFetchHtml, SafeFetchError } from "../lib/safe-fetch";
import { runPageSpeed, pageSpeedConfigured } from "../lib/pagespeed";
import { analyzePage } from "../lib/html-analysis";

const router: IRouter = Router();

router.get("/analyze/status", (_req, res) => {
  res.json({ pagespeed: pageSpeedConfigured() });
});

router.post("/analyze", analyzeRateLimit, async (req, res) => {
  let url: URL;
  try {
    url = normalizeUserUrl(req.body?.url);
  } catch (e) {
    const err = e as SafeFetchError;
    res.status(400).json({ error: err.code, message: err.message });
    return;
  }

  try {
    const page = await safeFetchHtml(url);
    const psi = await runPageSpeed(page.finalUrl);
    const analysis = analyzePage(page, psi);
    req.log.info({ host: new URL(page.finalUrl).hostname, psi: psi.available }, "analysis done");
    res.json({
      url: page.requestedUrl,
      finalUrl: page.finalUrl,
      analyzedAt: new Date().toISOString(),
      pagespeed: psi.available
        ? { available: true, score: psi.performanceScore, metrics: psi.metrics, reportUrl: psi.reportUrl }
        : { available: false, message: psi.message },
      ...analysis,
    });
  } catch (e) {
    if (e instanceof SafeFetchError) {
      req.log.info({ host: url.hostname, code: e.code }, "analysis failed");
      res.status(422).json({ error: e.code, message: e.message });
      return;
    }
    req.log.error({ err: e }, "analysis crashed");
    res.status(500).json({ error: "internal", message: "Ha ocurrido un error inesperado al analizar la web." });
  }
});

export default router;
