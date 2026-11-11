/* Analizador Web de ALVEO.
   Si este script no llega a ejecutarse, el formulario se envía al servidor y
   PHP muestra los resultados igualmente. Si se ejecuta, analiza sin recargar
   la página mediante admin-ajax.php. Ante cualquier fallo inesperado vuelve al
   envío normal del formulario: el usuario nunca se queda sin respuesta. */
(function () {
  "use strict";

  var TIMEOUT_MS = 45000;

  function init(root) {
    if (root.getAttribute("data-alveo-ready")) return;
    root.setAttribute("data-alveo-ready", "1");

    var ajaxUrl = root.getAttribute("data-ajax");
    var phone = root.getAttribute("data-whatsapp") || "";
    var form = root.querySelector(".alveo-an-form");
    var input = root.querySelector(".alveo-an-input");
    var button = form.querySelector("button[type=submit]");
    var errorBox = root.querySelector(".alveo-an-error");
    var loading = root.querySelector(".alveo-an-loading");
    var results = root.querySelector(".alveo-an-results");
    var jsCheck = root.querySelector(".alveo-an-jscheck");
    var busyNow = false;

    if (jsCheck) {
      jsCheck.textContent = "JavaScript del analizador: funcionando correctamente.";
    }

    function showError(msg) {
      errorBox.textContent = msg;
      errorBox.hidden = false;
    }

    function setBusy(on) {
      busyNow = on;
      button.disabled = on;
      input.readOnly = on;
      loading.hidden = !on;
    }

    /** Plan B: envío normal del formulario al servidor (PHP analiza y responde). */
    function serverFallback() {
      setBusy(false);
      loading.hidden = false; // La página se recargará con los resultados.
      button.disabled = true;
      HTMLFormElement.prototype.submit.call(form);
    }

    function analyze(url) {
      var body = new FormData();
      body.append("action", "alveo_analizar");
      body.append("url", url);
      body.append("wa", phone);

      var xhr = new XMLHttpRequest();
      xhr.open("POST", ajaxUrl, true);
      xhr.timeout = TIMEOUT_MS;
      xhr.onload = function () {
        var data = null;
        try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
        if (!data || typeof data.success !== "boolean") {
          // El servidor no ha respondido como esperábamos (caché, seguridad, etc.).
          serverFallback();
          return;
        }
        setBusy(false);
        if (!data.success) {
          showError((data.data && data.data.message) || "No hemos podido analizar la web. Inténtalo de nuevo en unos minutos.");
          return;
        }
        results.innerHTML = data.data.html; // HTML generado y escapado por el servidor.
        results.hidden = false;
        results.scrollIntoView({ behavior: "smooth", block: "start" });
      };
      xhr.onerror = function () {
        setBusy(false);
        showError("No hemos podido conectar con el analizador. Revisa tu conexión a internet e inténtalo de nuevo.");
      };
      xhr.ontimeout = function () {
        setBusy(false);
        showError("El análisis ha tardado demasiado. La web puede ser muy lenta o no responder. Inténtalo de nuevo en unos minutos.");
      };
      xhr.send(body);
    }

    form.addEventListener("submit", function (ev) {
      if (busyNow) { ev.preventDefault(); return; }
      try {
        errorBox.hidden = true;
        var url = input.value.trim();
        if (!url) {
          ev.preventDefault();
          showError("Escribe la dirección de tu web, por ejemplo: www.tunegocio.es");
          input.focus();
          return;
        }
        if (/\s/.test(url) || url.indexOf(".") === -1) {
          ev.preventDefault();
          showError("Esa dirección no parece válida. Escríbela así: www.tunegocio.es");
          input.focus();
          return;
        }
        if (!ajaxUrl || !window.FormData || !window.XMLHttpRequest) return; // Envío normal.
        ev.preventDefault();
        results.hidden = true;
        setBusy(true);
        analyze(url);
      } catch (e) {
        // Cualquier error inesperado: dejamos que el servidor responda.
        if (!ev.defaultPrevented) return;
        serverFallback();
      }
    });

    // «Analizar otra web» (los resultados pueden venir del servidor o de JavaScript).
    root.addEventListener("click", function (ev) {
      var t = ev.target;
      while (t && t !== root && !(t.hasAttribute && t.hasAttribute("data-again"))) t = t.parentNode;
      if (!t || t === root) return;
      ev.preventDefault();
      results.hidden = true;
      errorBox.hidden = true;
      input.value = "";
      root.scrollIntoView({ behavior: "smooth", block: "start" });
      try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
    });
  }

  function boot() {
    var roots = document.querySelectorAll(".alveo-an");
    for (var i = 0; i < roots.length; i++) {
      try { init(roots[i]); } catch (e) { /* El formulario sigue funcionando sin JavaScript. */ }
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
