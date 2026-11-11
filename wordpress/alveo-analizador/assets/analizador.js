/* Analizador Web de ALVEO. Todo lo que llega de webs externas se pinta con
   textContent (nunca como HTML) para evitar inyección de código. */
(function () {
  "use strict";

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function init(root) {
    var endpoint = root.getAttribute("data-endpoint");
    var phone = root.getAttribute("data-whatsapp") || "";
    var form = root.querySelector(".alveo-an-form");
    var input = root.querySelector(".alveo-an-input");
    var button = form.querySelector("button[type=submit]");
    var errorBox = root.querySelector(".alveo-an-error");
    var loading = root.querySelector(".alveo-an-loading");
    var results = root.querySelector(".alveo-an-results");
    var slot = function (name) { return root.querySelector('[data-slot="' + name + '"]'); };

    function showError(msg) {
      errorBox.textContent = msg;
      errorBox.hidden = false;
    }

    function busy(on) {
      button.disabled = on;
      input.readOnly = on;
      loading.hidden = !on;
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      errorBox.hidden = true;
      var url = input.value.trim();
      if (!url) {
        showError("Escribe la dirección de tu web, por ejemplo: www.tunegocio.es");
        input.focus();
        return;
      }
      if (/\s/.test(url) || url.indexOf(".") === -1) {
        showError("Esa dirección no parece válida. Escríbela así: www.tunegocio.es");
        input.focus();
        return;
      }
      results.hidden = true;
      busy(true);

      var ctrl = "AbortController" in window ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 45000);
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ url: url }),
        signal: ctrl ? ctrl.signal : undefined
      })
        .then(function (r) {
          return r.json().catch(function () { return null; }).then(function (data) {
            if (!r.ok || !data || !data.improvements) {
              showError((data && data.message) || "No hemos podido analizar la web. Inténtalo de nuevo en unos minutos.");
              return;
            }
            render(data);
          });
        })
        .catch(function (e) {
          showError(e && e.name === "AbortError"
            ? "El análisis ha tardado demasiado. Inténtalo de nuevo en unos minutos."
            : "No hemos podido conectar con el analizador. Revisa tu conexión e inténtalo de nuevo.");
        })
        .then(function () {
          clearTimeout(timer);
          busy(false);
        });
    });

    function render(data) {
      slot("site").textContent = data.site;
      var when = new Date().toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
      slot("meta").textContent = "Analizada el " + when + " · " + data.checked + " comprobaciones sobre el código de la página";

      var notices = slot("notices");
      notices.replaceChildren();
      notices.hidden = !data.notices.length;
      data.notices.forEach(function (t) { notices.append(el("p", null, t)); });

      var list = slot("improvements");
      list.replaceChildren();
      var n = data.improvements.length;
      slot("title").textContent = n === 3 ? "Las 3 mejoras más importantes"
        : n === 2 ? "Las 2 mejoras más importantes"
        : n === 1 ? "La mejora más importante"
        : "No hemos detectado mejoras urgentes";
      data.improvements.forEach(function (imp) {
        var li = el("li");
        var head = el("div");
        head.append(el("h4", null, imp.title), el("span", "alveo-an-area", imp.area));
        var body = el("div");
        body.append(el("p", null, imp.text), el("span", "alveo-an-evidence", imp.evidence));
        li.append(head, body);
        list.append(li);
      });
      list.hidden = n === 0;
      var none = slot("none");
      none.hidden = n === 3;
      none.textContent = n === 0
        ? "En lo que hemos podido comprobar automáticamente tu web está bien preparada. Aun así, en una revisión personalizada podemos encontrar oportunidades en tu ficha de Google, tus redes y tus mensajes."
        : "Solo te mostramos los problemas que hemos detectado de verdad en tu página.";
      if (n > 0 && n < 3) none.style.marginTop = "26px";

      var chips = slot("strengths");
      chips.replaceChildren();
      data.strengths.slice(0, 10).forEach(function (s) {
        var li = el("li", null, s.label);
        li.title = s.evidence;
        chips.append(li);
      });
      slot("strengths-wrap").hidden = !data.strengths.length;

      var wa = slot("whatsapp");
      if (phone.length >= 9) {
        var msg = "Hola ALVEO, he analizado mi web (" + data.url + ") con vuestro analizador y me gustaría que la revisarais conmigo.";
        wa.href = "https://wa.me/" + phone + "?text=" + encodeURIComponent(msg);
        wa.hidden = false;
      } else {
        wa.hidden = true;
      }

      results.hidden = false;
      results.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    slot("again").addEventListener("click", function () {
      results.hidden = true;
      input.value = "";
      root.scrollIntoView({ behavior: "smooth", block: "start" });
      input.focus({ preventScroll: true });
    });
  }

  function boot() {
    var roots = document.querySelectorAll(".alveo-an");
    for (var i = 0; i < roots.length; i++) init(roots[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
