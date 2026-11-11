(() => {
  "use strict";
  const body = document.body;
  const API = (body.dataset.apiBase || "").replace(/\/$/, "");
  const CONTACT = body.dataset.contactUrl || "https://alveoagencia.es/#contacto";

  const $ = (id) => document.getElementById(id);
  const form = $("an-form");
  const input = $("an-url");
  const submit = $("an-submit");
  const errorBox = $("an-error");
  const loading = $("an-loading");
  const results = $("an-results");
  $("an-year").textContent = String(new Date().getFullYear());

  document.querySelectorAll(".js-contact").forEach((a) => a.setAttribute("href", CONTACT));

  const STATUS_LABEL = { good: "Bien", improve: "Mejorable", problem: "Necesita mejoras", unknown: "No comprobado" };
  const CHECK_ICON = { pass: "✓", warn: "!", fail: "×", info: "i", unknown: "?" };
  const CHECK_LABEL = { pass: "Correcto", warn: "Mejorable", fail: "Problema", info: "Recomendación", unknown: "No comprobado" };
  const CAT_NAME = { mobile: "Móvil", speed: "Velocidad", seo: "SEO", content: "Contenido", contact: "Contacto" };

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function badge(status) {
    return el("span", `an-badge an-badge-${status}`, STATUS_LABEL[status] || status);
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }

  function setBusy(busy) {
    submit.disabled = busy;
    input.readOnly = busy;
    loading.hidden = !busy;
  }

  async function checkPageSpeed() {
    try {
      const r = await fetch(`${API}/api/analyze/status`);
      if (r.ok) return Boolean((await r.json()).pagespeed);
    } catch (_) { /* sin importancia */ }
    return false;
  }
  const pageSpeedReady = checkPageSpeed();

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    errorBox.hidden = true;
    const url = input.value.trim();
    if (!url) {
      showError("Escribe la dirección de tu web, por ejemplo: www.tunegocio.es");
      input.focus();
      return;
    }
    if (/\s/.test(url) || !/\./.test(url)) {
      showError("Esa dirección no parece válida. Escríbela así: www.tunegocio.es");
      input.focus();
      return;
    }
    results.hidden = true;
    results.replaceChildren();
    $("an-loading-url").textContent = url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    $("an-loading-copy").textContent = (await pageSpeedReady)
      ? "Descargamos tu página tal como la ve un visitante y Google PageSpeed mide su velocidad en móvil. Puede tardar hasta un minuto."
      : "Descargamos tu página tal como la ve un visitante y revisamos su código. Suele tardar unos segundos.";
    setBusy(true);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 100000);
      const r = await fetch(`${API}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      let data = null;
      try { data = await r.json(); } catch (_) { /* respuesta no JSON */ }
      if (!r.ok || !data || !data.categories) {
        showError((data && data.message) || "No hemos podido analizar la web. Inténtalo de nuevo en unos minutos.");
        return;
      }
      render(data);
    } catch (e) {
      showError(e && e.name === "AbortError"
        ? "El análisis ha tardado demasiado. Inténtalo de nuevo en unos minutos."
        : "No hemos podido conectar con el analizador. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  });

  function render(data) {
    const tpl = $("tpl-results").content.cloneNode(true);
    const slot = (name) => tpl.querySelector(`[data-slot="${name}"]`);

    const final = new URL(data.finalUrl);
    slot("site").textContent = final.hostname.replace(/^www\./, "") + (final.pathname !== "/" ? final.pathname : "");
    const meta = slot("meta");
    const when = new Date(data.analyzedAt).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
    meta.append(`Analizada el ${when} · `);
    const link = el("a", null, data.finalUrl);
    link.href = data.finalUrl;
    link.target = "_blank";
    link.rel = "noopener nofollow";
    meta.append(link);
    if (data.pagespeed && data.pagespeed.available) {
      meta.append(" · ");
      const ps = el("a", null, "Informe completo de PageSpeed ↗");
      ps.href = data.pagespeed.reportUrl;
      ps.target = "_blank";
      ps.rel = "noopener";
      meta.append(ps);
    }

    if (data.warnings && data.warnings.length) {
      const w = slot("warnings");
      w.hidden = false;
      data.warnings.forEach((t) => w.append(el("p", null, t)));
      w.querySelectorAll("p").forEach((p) => { p.style.margin = "0"; });
    }

    const overview = slot("overview");
    data.categories.forEach((c) => {
      const a = el("a", "an-ov");
      a.href = `#cat-${c.id}`;
      a.append(el("h3", null, c.title), badge(c.status));
      a.addEventListener("click", () => {
        const d = document.getElementById(`cat-${c.id}`);
        if (d) d.open = true;
      });
      overview.append(a);
    });

    const list = slot("improvements");
    if (data.improvements.length) {
      if (data.improvements.length < 3) {
        slot("top-title").textContent = data.improvements.length === 1 ? "La mejora más importante" : `Las ${data.improvements.length} mejoras más importantes`;
      }
      data.improvements.forEach((imp) => {
        const li = el("li");
        const h = el("div");
        h.append(el("h3", null, imp.title), el("span", "an-imp-cat", CAT_NAME[imp.category] || ""));
        li.append(h, el("p", null, imp.text));
        list.append(li);
      });
    } else {
      list.replaceWith(el("p", "an-none", "En lo que hemos podido comprobar automáticamente no hay mejoras urgentes. Aun así, una auditoría personalizada puede detectar oportunidades en tu ficha de Google, tus redes y tus mensajes."));
    }

    const cats = slot("categories");
    data.categories.forEach((c) => {
      const d = el("details", "an-cat");
      d.id = `cat-${c.id}`;
      if (c.status === "problem" || c.status === "improve") d.open = true;
      const s = el("summary");
      const h = el("h3", null, c.title);
      h.append(el("span", "an-cat-summary", c.summary));
      s.append(h, badge(c.status), el("span", "an-toggle", "+"));
      d.append(s);
      const ul = el("ul", "an-checks");
      c.checks.forEach((ch) => {
        const li = el("li", "an-check");
        const icon = el("span", `an-icon an-icon-${ch.status}`, CHECK_ICON[ch.status]);
        icon.setAttribute("aria-label", CHECK_LABEL[ch.status]);
        icon.setAttribute("role", "img");
        const txt = el("div");
        txt.append(el("b", null, ch.label), el("p", null, ch.detail));
        li.append(icon, txt);
        ul.append(li);
      });
      d.append(ul);
      if (c.note) d.append(el("p", "an-cat-note", c.note));
      cats.append(d);
    });
    const legend = el("div", "an-legend");
    Object.keys(CHECK_ICON).forEach((k) => {
      const sp = el("span");
      sp.append(el("span", `an-icon an-icon-${k}`, CHECK_ICON[k]), CHECK_LABEL[k]);
      legend.append(sp);
    });
    cats.after(legend);

    tpl.querySelectorAll(".js-contact").forEach((a) => a.setAttribute("href", CONTACT));
    slot("again").addEventListener("click", () => {
      results.hidden = true;
      input.value = "";
      window.scrollTo({ top: 0, behavior: "smooth" });
      input.focus({ preventScroll: true });
    });

    results.replaceChildren(tpl);
    results.hidden = false;
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  }
})();
