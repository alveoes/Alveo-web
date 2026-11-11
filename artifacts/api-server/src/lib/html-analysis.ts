/**
 * Análisis del HTML accesible de una página. Cada comprobación incluye lo que
 * se ha encontrado realmente en el código, para que el resultado sea verificable.
 */
import { parse, type HTMLElement } from "node-html-parser";
import type { FetchedPage } from "./safe-fetch";
import type { PageSpeedResult } from "./pagespeed";

export type CheckStatus = "pass" | "warn" | "fail" | "info" | "unknown";
export type CategoryStatus = "good" | "improve" | "problem" | "unknown";
export type CategoryId = "mobile" | "speed" | "seo" | "content" | "contact";

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

interface Fix {
  priority: number; // 1-10, impacto en captación de clientes
  title: string;
  text: string;
}

interface InternalCheck extends Check {
  fix?: Fix;
}

export interface Category {
  id: CategoryId;
  title: string;
  status: CategoryStatus;
  summary: string;
  checks: Check[];
  note?: string;
}

export interface Improvement {
  category: CategoryId;
  title: string;
  text: string;
}

export interface AnalysisResult {
  categories: Category[];
  improvements: Improvement[];
  warnings: string[];
  page: { title: string | null; words: number };
}

const fmtKb = (b: number) => (b < 1024 ? `${b} B` : `${Math.round(b / 1024)} KB`);
const fmtMs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace(".", ",")} s`);
const quote = (s: string, max = 90) => `«${s.length > max ? `${s.slice(0, max - 1)}…` : s}»`;
const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Texto visible de un elemento (sin scripts ni estilos), con espacios entre bloques. */
function textOf(el: HTMLElement | null | undefined): string {
  if (!el) return "";
  const copy = el.clone() as HTMLElement;
  copy.querySelectorAll("script,style,noscript,template,svg,iframe,canvas").forEach((n) => n.remove());
  return clean(copy.structuredText);
}

function visibleText(root: HTMLElement): string {
  return textOf(root.querySelector("body") ?? root);
}

function words(text: string): string[] {
  return text.split(/\s+/).filter((w) => /\p{L}/u.test(w));
}

function categoryStatus(checks: InternalCheck[]): CategoryStatus {
  const evaluated = checks.filter((c) => c.status !== "info" && c.status !== "unknown");
  if (!evaluated.length) return "unknown";
  if (evaluated.some((c) => c.status === "fail")) return "problem";
  const warns = evaluated.filter((c) => c.status === "warn").length;
  if (warns >= 2 || (warns === 1 && evaluated.length <= 2)) return "improve";
  return warns ? "improve" : "good";
}

function summaryFor(status: CategoryStatus, checks: InternalCheck[]): string {
  const evaluated = checks.filter((c) => c.status !== "info" && c.status !== "unknown");
  const ok = evaluated.filter((c) => c.status === "pass").length;
  if (status === "unknown") return "No se ha podido comprobar con los datos disponibles.";
  return `${ok} de ${evaluated.length} comprobaciones correctas.`;
}

/* ------------------------------------------------------------------------ */

function analyzeMobile(root: HTMLElement): InternalCheck[] {
  const checks: InternalCheck[] = [];
  const vp = root.querySelector('meta[name="viewport" i]') ?? root.querySelectorAll("meta").find((m) => (m.getAttribute("name") ?? "").toLowerCase() === "viewport");
  const content = clean(vp?.getAttribute("content")).toLowerCase();
  if (!vp) {
    checks.push({
      id: "viewport",
      label: "Configuración para móviles (viewport)",
      status: "fail",
      detail: "No hemos encontrado la etiqueta «viewport». Sin ella, los móviles muestran la web como si fuera de ordenador, en miniatura.",
      fix: {
        priority: 10,
        title: "Haz que tu web se vea bien en el móvil",
        text: "Tu web no indica a los móviles cómo adaptarse a la pantalla, así que se ve diminuta y obliga a hacer zoom. La mayoría de tus clientes te visita desde el móvil: es lo primero que conviene arreglar.",
      },
    });
  } else if (!content.includes("width=device-width")) {
    checks.push({
      id: "viewport",
      label: "Configuración para móviles (viewport)",
      status: "warn",
      detail: `La etiqueta existe pero no usa «width=device-width»: ${quote(content)}.`,
      fix: {
        priority: 8,
        title: "Ajusta la web al ancho de los móviles",
        text: "Tu web tiene una configuración para móviles incompleta y puede no ocupar bien la pantalla. Es un cambio pequeño en el código que mejora mucho la experiencia.",
      },
    });
  } else {
    checks.push({ id: "viewport", label: "Configuración para móviles (viewport)", status: "pass", detail: `Correcta: ${quote(content)}.` });
  }

  if (vp) {
    const maxScale = content.match(/maximum-scale\s*=\s*([\d.]+)/);
    const blocked = /user-scalable\s*=\s*(no|0)/.test(content) || (maxScale && Number(maxScale[1]) < 2);
    checks.push(
      blocked
        ? {
            id: "zoom",
            label: "Permite ampliar el texto",
            status: "warn",
            detail: "La web impide hacer zoom en el móvil (user-scalable=no o maximum-scale bajo).",
            fix: {
              priority: 4,
              title: "Deja que tus visitantes puedan ampliar la web",
              text: "Tu web bloquea el zoom en el móvil. Muchas personas lo necesitan para leer precios, horarios o direcciones. Quitar ese bloqueo es sencillo.",
            },
          }
        : { id: "zoom", label: "Permite ampliar el texto", status: "pass", detail: "No se bloquea el zoom." },
    );
  }

  const inlineCss = root.querySelectorAll("style").map((s) => s.textContent).join("\n");
  const hasMedia = /@media[^{]*\((max|min)-width/i.test(inlineCss) || root.querySelectorAll("link[media]").some((l) => /width/i.test(l.getAttribute("media") ?? ""));
  const hasSrcset = root.querySelectorAll("img[srcset],source[srcset]").length > 0;
  checks.push(
    hasMedia || hasSrcset
      ? {
          id: "responsive",
          label: "Señales de diseño adaptable",
          status: "pass",
          detail: [hasMedia && "estilos específicos para pantallas pequeñas", hasSrcset && "imágenes en varios tamaños"].filter(Boolean).join(" y ").replace(/^./, (c) => c.toUpperCase()) + ".",
        }
      : {
          id: "responsive",
          label: "Señales de diseño adaptable",
          status: "unknown",
          detail: "Los estilos están en archivos externos que esta versión no revisa. Para ver el resultado visual, mide la web con PageSpeed.",
        },
  );
  return checks;
}

function analyzeSpeed(root: HTMLElement, page: FetchedPage, psi: PageSpeedResult): InternalCheck[] {
  const checks: InternalCheck[] = [];
  if (psi.available) {
    const s = psi.performanceScore;
    checks.push({
      id: "psi-score",
      label: "Rendimiento en móvil (Google PageSpeed)",
      status: s >= 90 ? "pass" : s >= 50 ? "warn" : "fail",
      detail: `Google le da ${s} sobre 100. ${psi.metrics.map((m) => `${m.label}: ${m.value}`).join(" · ")}.`,
      fix:
        s < 90
          ? {
              priority: s < 50 ? 9 : 6,
              title: "Haz que tu web cargue más rápido en el móvil",
              text: `Google valora la velocidad de tu web en móvil con ${s}/100. Cada segundo de espera hace que algunas personas se vayan antes de ver lo que ofreces.${psi.opportunities.length ? ` Lo que más la frena: ${psi.opportunities.map((o) => o.title.toLowerCase()).join("; ")}.` : ""}`,
            }
          : undefined,
    });
    if (psi.fieldData?.overall) {
      const label = { FAST: "rápida", AVERAGE: "mejorable", SLOW: "lenta" }[psi.fieldData.overall];
      checks.push({
        id: "psi-field",
        label: "Experiencia de visitantes reales (Chrome)",
        status: psi.fieldData.overall === "FAST" ? "pass" : psi.fieldData.overall === "AVERAGE" ? "warn" : "fail",
        detail: `Según datos reales de usuarios de Chrome en los últimos 28 días, la carga es ${label}${psi.fieldData.lcpMs ? ` (contenido principal en ${fmtMs(psi.fieldData.lcpMs)})` : ""}.`,
      });
    }
  } else {
    checks.push({ id: "psi-score", label: "Rendimiento en móvil (Google PageSpeed)", status: "unknown", detail: psi.message });
  }

  const t = page.responseTimeMs;
  checks.push({
    id: "ttfb",
    label: "Tiempo de respuesta del servidor",
    status: t < 800 ? "pass" : t < 1800 ? "warn" : "fail",
    detail: `El servidor tardó ${fmtMs(t)} en empezar a responder (una medición desde nuestro servidor).`,
    fix:
      t >= 800
        ? {
            priority: t >= 1800 ? 7 : 4,
            title: "Reduce la espera inicial de tu web",
            text: `Tu servidor tarda ${fmtMs(t)} en empezar a enviar la página, antes de que se vea nada. Suele mejorar con un alojamiento más rápido o con caché.`,
          }
        : undefined,
  });

  const enc = String(page.headers["content-encoding"] ?? "").toLowerCase();
  if (page.htmlBytes > 10 * 1024) {
    checks.push(
      enc
        ? { id: "compression", label: "Compresión activada", status: "pass", detail: `La página se envía comprimida (${enc}): ${fmtKb(page.transferBytes)} transferidos de ${fmtKb(page.htmlBytes)}.` }
        : {
            id: "compression",
            label: "Compresión activada",
            status: "warn",
            detail: `La página (${fmtKb(page.htmlBytes)}) se envía sin comprimir.`,
            fix: {
              priority: 4,
              title: "Activa la compresión en tu alojamiento",
              text: "Tu web se envía sin comprimir, lo que la hace más pesada de lo necesario. Se activa en la configuración del alojamiento y no cambia nada de lo que se ve.",
            },
          },
    );
  }

  const kb = page.htmlBytes / 1024;
  checks.push({
    id: "html-size",
    label: "Peso del código de la página",
    status: kb <= 300 ? "pass" : kb <= 1024 ? "warn" : "fail",
    detail: `El HTML pesa ${fmtKb(page.htmlBytes)} (sin contar imágenes ni otros archivos).`,
    fix:
      kb > 300
        ? { priority: 3, title: "Aligera el código de tu web", text: `El código de tu página pesa ${fmtKb(page.htmlBytes)}, bastante más de lo habitual. Suele deberse a plantillas o complementos que cargan cosas que no se usan.` }
        : undefined,
  });

  const imgs = root.querySelectorAll("img");
  const lazy = imgs.filter((i) => (i.getAttribute("loading") ?? "").toLowerCase() === "lazy" || i.hasAttribute("data-src") || i.hasAttribute("data-lazy-src")).length;
  if (imgs.length > 6) {
    checks.push(
      lazy > 0
        ? { id: "lazy", label: "Carga diferida de imágenes", status: "pass", detail: `${lazy} de ${imgs.length} imágenes se cargan solo cuando hacen falta.` }
        : {
            id: "lazy",
            label: "Carga diferida de imágenes",
            status: "warn",
            detail: `Hay ${imgs.length} imágenes y ninguna usa carga diferida (loading="lazy").`,
            fix: { priority: 4, title: "Carga las imágenes solo cuando se vean", text: `Tu página tiene ${imgs.length} imágenes y todas se descargan nada más entrar, aunque estén al final. Cargarlas a medida que se baja acelera la primera impresión.` },
          },
    );
  }

  const headScripts = (root.querySelector("head")?.querySelectorAll("script[src]") ?? []).filter((s) => !s.hasAttribute("async") && !s.hasAttribute("defer") && (s.getAttribute("type") ?? "") !== "module");
  if (headScripts.length > 3) {
    checks.push({
      id: "blocking",
      label: "Scripts que bloquean la carga",
      status: "warn",
      detail: `${headScripts.length} scripts en la cabecera se cargan antes de mostrar la página.`,
      fix: { priority: 4, title: "Evita que los scripts retrasen tu web", text: `Hay ${headScripts.length} archivos de código que el navegador debe descargar antes de enseñar nada. Pueden cargarse después sin que la web pierda funciones.` },
    });
  }

  if (page.redirects.length > 1) {
    checks.push({
      id: "redirects",
      label: "Redirecciones",
      status: "warn",
      detail: `Antes de llegar a la página hay ${page.redirects.length} redirecciones encadenadas.`,
      fix: { priority: 3, title: "Elimina saltos innecesarios", text: `Al escribir tu dirección, la web salta ${page.redirects.length} veces antes de cargar. Cada salto añade espera; lo ideal es uno como máximo.` },
    });
  }
  return checks;
}

function analyzeSeo(root: HTMLElement, page: FetchedPage): InternalCheck[] {
  const checks: InternalCheck[] = [];
  const https = page.finalUrl.startsWith("https://");
  checks.push(
    https
      ? { id: "https", label: "Conexión segura (HTTPS)", status: "pass", detail: "La web usa HTTPS." }
      : {
          id: "https",
          label: "Conexión segura (HTTPS)",
          status: "fail",
          detail: "La web se sirve sin HTTPS. Los navegadores la marcan como «No segura».",
          fix: { priority: 9, title: "Activa la conexión segura (HTTPS)", text: "Chrome muestra tu web como «No segura». Eso genera desconfianza y Google la favorece menos. La mayoría de alojamientos ofrecen el certificado gratis." },
        },
  );

  const robotsMeta = root.querySelectorAll("meta").filter((m) => /^(robots|googlebot)$/i.test(m.getAttribute("name") ?? "")).map((m) => clean(m.getAttribute("content")).toLowerCase());
  const xRobots = String(page.headers["x-robots-tag"] ?? "").toLowerCase();
  const noindex = robotsMeta.some((c) => c.includes("noindex") || c.includes("none")) || xRobots.includes("noindex");
  checks.push(
    noindex
      ? {
          id: "indexable",
          label: "Google puede mostrar la página",
          status: "fail",
          detail: `La página pide a Google que no la muestre en resultados («noindex»${xRobots.includes("noindex") ? " en la cabecera X-Robots-Tag" : ""}).`,
          fix: { priority: 10, title: "Permite que Google muestre tu web", text: "Tu web le dice a Google que no la incluya en sus resultados, así que no te encontrarán al buscarte. A menudo es un ajuste que se quedó activado tras construir la web." },
        }
      : { id: "indexable", label: "Google puede mostrar la página", status: "pass", detail: "No hay ninguna instrucción que impida aparecer en Google." },
  );

  const title = clean(root.querySelector("title")?.textContent);
  if (!title) {
    checks.push({
      id: "title",
      label: "Título de la página",
      status: "fail",
      detail: "La página no tiene título (etiqueta <title>).",
      fix: { priority: 8, title: "Ponle un título claro a tu web", text: "Tu página no tiene título, que es el texto azul que aparece en Google. Debe decir qué haces y dónde, por ejemplo: «Peluquería en Granada | Nombre»." },
    });
  } else if (title.length < 15 || title.length > 65) {
    checks.push({
      id: "title",
      label: "Título de la página",
      status: "warn",
      detail: `${quote(title)} (${title.length} caracteres; lo recomendable es entre 15 y 65).`,
      fix: {
        priority: 5,
        title: title.length < 15 ? "Haz más descriptivo el título de tu web" : "Acorta el título de tu web",
        text: title.length < 15 ? `El título que ve Google es solo ${quote(title)}. Añade qué ofreces y en qué ciudad para que te elijan al buscar.` : `El título tiene ${title.length} caracteres y Google lo cortará. Deja lo importante al principio: qué haces y dónde.`,
      },
    });
  } else {
    checks.push({ id: "title", label: "Título de la página", status: "pass", detail: `${quote(title)} (${title.length} caracteres).` });
  }

  const desc = clean(root.querySelectorAll("meta").find((m) => (m.getAttribute("name") ?? "").toLowerCase() === "description")?.getAttribute("content"));
  if (!desc) {
    checks.push({
      id: "description",
      label: "Descripción para Google",
      status: "fail",
      detail: "No hay meta descripción. Google elegirá un trozo de texto al azar para mostrar.",
      fix: { priority: 6, title: "Escribe la descripción que verá la gente en Google", text: "Tu web no tiene descripción, así que Google muestra un fragmento cualquiera bajo tu nombre. Dos frases que expliquen lo que ofreces y por qué elegirte animan a hacer clic." },
    });
  } else if (desc.length < 70 || desc.length > 165) {
    checks.push({
      id: "description",
      label: "Descripción para Google",
      status: "warn",
      detail: `${quote(desc)} (${desc.length} caracteres; lo recomendable es entre 70 y 160).`,
      fix: { priority: 3, title: "Ajusta la descripción que aparece en Google", text: desc.length < 70 ? "La descripción de tu web es muy corta. Aprovecha ese espacio para explicar qué ofreces y animar a hacer clic." : "La descripción de tu web es demasiado larga y Google la cortará. Resume lo esencial en unas 150 letras." },
    });
  } else {
    checks.push({ id: "description", label: "Descripción para Google", status: "pass", detail: `${quote(desc)} (${desc.length} caracteres).` });
  }

  const h1s = root.querySelectorAll("h1");
  checks.push(
    h1s.length === 1
      ? { id: "h1", label: "Encabezado principal (H1)", status: "pass", detail: `Hay un único H1: ${quote(textOf(h1s[0]) || "(sin texto)")}.` }
      : h1s.length === 0
        ? {
            id: "h1",
            label: "Encabezado principal (H1)",
            status: "fail",
            detail: "No hay ningún encabezado H1 en el código.",
            fix: { priority: 6, title: "Añade un titular principal a tu página", text: "Tu página no tiene un titular principal en el código. Google lo usa para entender de qué trata; debería decir claramente qué ofreces." },
          }
        : {
            id: "h1",
            label: "Encabezado principal (H1)",
            status: "warn",
            detail: `Hay ${h1s.length} encabezados H1; lo recomendable es uno solo.`,
            fix: { priority: 2, title: "Deja un solo titular principal", text: `Tu página tiene ${h1s.length} titulares principales. Tener uno solo ayuda a Google a entender cuál es el tema central.` },
          },
  );

  const lang = clean(root.querySelector("html")?.getAttribute("lang"));
  checks.push(
    lang
      ? { id: "lang", label: "Idioma declarado", status: "pass", detail: `Idioma: «${lang}».` }
      : { id: "lang", label: "Idioma declarado", status: "warn", detail: "La página no indica en qué idioma está.", fix: { priority: 2, title: "Indica el idioma de tu web", text: "Tu web no declara su idioma. Es un detalle técnico pequeño que ayuda a Google y a los lectores de pantalla." } },
  );

  const imgs = root.querySelectorAll("img");
  if (imgs.length) {
    const noAlt = imgs.filter((i) => !i.hasAttribute("alt")).length;
    const ratio = noAlt / imgs.length;
    checks.push(
      ratio <= 0.2
        ? { id: "alt", label: "Imágenes con descripción (alt)", status: "pass", detail: `${imgs.length - noAlt} de ${imgs.length} imágenes tienen texto alternativo.` }
        : {
            id: "alt",
            label: "Imágenes con descripción (alt)",
            status: "warn",
            detail: `${noAlt} de ${imgs.length} imágenes no tienen texto alternativo.`,
            fix: { priority: 3, title: "Describe tus imágenes", text: `${plural(noAlt, "imagen no tiene", "imágenes no tienen")} descripción. Google no «ve» las fotos: una breve descripción le ayuda a mostrarlas en búsquedas de imágenes.` },
          },
    );
  }

  const ld = root.querySelectorAll('script[type="application/ld+json"]').map((s) => s.textContent);
  const ldTypes = Array.from(new Set(ld.flatMap((j) => Array.from(j.matchAll(/"@type"\s*:\s*"([^"]+)"/g)).map((m) => m[1])))).slice(0, 5);
  checks.push(
    ld.length
      ? { id: "schema", label: "Datos estructurados para Google", status: "pass", detail: `Encontrados${ldTypes.length ? `: ${ldTypes.join(", ")}` : ""}.` }
      : {
          id: "schema",
          label: "Datos estructurados para Google",
          status: "info",
          detail: "No hay datos estructurados (JSON-LD). Ayudan a Google a mostrar horario, dirección o valoraciones del negocio.",
          fix: { priority: 2, title: "Dale a Google los datos de tu negocio", text: "Tu web no incluye la ficha técnica del negocio (dirección, horario, teléfono) en el formato que Google entiende. Facilita que muestre esos datos en los resultados." },
        },
  );

  const ogTitle = root.querySelectorAll("meta").some((m) => (m.getAttribute("property") ?? "") === "og:title");
  const ogImage = root.querySelectorAll("meta").some((m) => (m.getAttribute("property") ?? "") === "og:image");
  checks.push(
    ogTitle && ogImage
      ? { id: "og", label: "Vista previa al compartir", status: "pass", detail: "Tiene título e imagen para cuando se comparte en WhatsApp o redes." }
      : {
          id: "og",
          label: "Vista previa al compartir",
          status: "warn",
          detail: `Falta ${[!ogTitle && "el título", !ogImage && "la imagen"].filter(Boolean).join(" y ")} para la vista previa al compartir (Open Graph).`,
          fix: { priority: 3, title: "Cuida cómo se ve tu web al compartirla", text: "Cuando alguien envía tu web por WhatsApp o redes, no aparece una vista previa completa con imagen. Configurarla hace que el enlace parezca más profesional y reciba más clics." },
        },
  );
  return checks;
}

const CTA_RE = /(?<![\p{L}])(llam[ae]|llámanos|contact[ae]|contáctanos|escr[ií]benos|reserv[ae]|reservar|pide|pedir|solicit[ae]|presupuesto|compra|comprar|cita previa|empieza|suscr[ií]bete|reg[ií]strate|descarga|apúntate|inscr[ií]bete|book|call|contact us|get started|sign up|buy|shop|order)(?![\p{L}])/iu;

function analyzeContent(root: HTMLElement, text: string, jsRendered: boolean): InternalCheck[] {
  const checks: InternalCheck[] = [];
  const w = words(text);
  if (jsRendered) {
    return [
      {
        id: "js",
        label: "Contenido legible en el código",
        status: "unknown",
        detail: `Solo hay ${w.length} palabras en el HTML: el contenido se genera con JavaScript y esta herramienta no puede leerlo. Google sí puede, aunque a veces con retraso.`,
      },
    ];
  }

  const h1 = textOf(root.querySelector("h1"));
  const h1Words = words(h1).length;
  checks.push(
    h1Words >= 2 && h1Words <= 15
      ? { id: "headline", label: "Titular principal claro", status: "pass", detail: `El titular dice: ${quote(h1)}. Comprueba que explica qué ofreces.` }
      : {
          id: "headline",
          label: "Titular principal claro",
          status: "warn",
          detail: h1 ? `El titular ${quote(h1)} tiene ${plural(h1Words, "palabra", "palabras")}; lo ideal es una frase breve (2-15).` : "No hay un titular principal con texto.",
          fix: { priority: 7, title: "Explica en una frase qué ofreces", text: "Al entrar en tu web no hay un titular claro que diga qué haces y para quién. Tienes unos segundos para convencer: una frase como «Fisioterapia deportiva en Granada» funciona mejor que un eslogan genérico." },
        },
  );

  const n = w.length;
  checks.push({
    id: "words",
    label: "Cantidad de información",
    status: n >= 300 ? "pass" : n >= 150 ? "warn" : "fail",
    detail: `La página tiene unas ${n} palabras de texto visible.`,
    fix:
      n < 300
        ? { priority: n < 150 ? 7 : 4, title: "Cuenta más sobre tu negocio", text: `Tu página tiene muy poco texto (unas ${n} palabras). Explica tus servicios, precios orientativos, zona de trabajo y por qué elegirte: ayuda a convencer a quien te visita y a que Google te encuentre.` }
        : undefined,
  });

  const subs = root.querySelectorAll("h2,h3").length;
  checks.push(
    subs >= 2
      ? { id: "subheadings", label: "Contenido organizado en apartados", status: "pass", detail: `${subs} subtítulos (H2/H3) que ordenan el contenido.` }
      : { id: "subheadings", label: "Contenido organizado en apartados", status: "warn", detail: `Solo ${plural(subs, "subtítulo", "subtítulos")} (H2/H3).`, fix: { priority: 3, title: "Ordena tu contenido con subtítulos", text: "Tu página apenas tiene subtítulos, lo que la hace difícil de leer por encima. Divide la información en bloques claros: servicios, precios, opiniones, contacto." } },
  );

  const paragraphs = root.querySelectorAll("p").map((p) => textOf(p)).filter((p) => words(p).length >= 5);
  const sentences = paragraphs.join(" ").split(/[.!?…]+\s/).map((s) => words(s).length).filter((x) => x >= 3);
  if (sentences.length >= 5) {
    const avg = Math.round(sentences.reduce((a, b) => a + b, 0) / sentences.length);
    checks.push(
      avg <= 22
        ? { id: "sentences", label: "Frases fáciles de leer", status: "pass", detail: `Las frases tienen de media ${avg} palabras.` }
        : { id: "sentences", label: "Frases fáciles de leer", status: "warn", detail: `Las frases tienen de media ${avg} palabras; por encima de 22 cuestan más de leer.`, fix: { priority: 3, title: "Usa frases más cortas", text: `Las frases de tu web son largas (${avg} palabras de media). En el móvil se lee en diagonal: frases cortas y directas se entienden mejor.` } },
    );
  }

  const actions = root.querySelectorAll("a,button,input[type=submit]").map((el) => textOf(el) || clean(el.getAttribute("value") || el.getAttribute("aria-label"))).filter((t) => t && t.length < 60 && CTA_RE.test(t));
  checks.push(
    actions.length
      ? { id: "cta", label: "Botones que invitan a actuar", status: "pass", detail: `Por ejemplo: ${Array.from(new Set(actions)).slice(0, 3).map((a) => quote(a, 40)).join(", ")}.` }
      : { id: "cta", label: "Botones que invitan a actuar", status: "warn", detail: "No hemos encontrado botones o enlaces del tipo «Llámanos», «Reserva» o «Pide presupuesto».", fix: { priority: 8, title: "Dile al visitante qué hacer a continuación", text: "Tu web no tiene botones claros como «Reserva ahora» o «Pide presupuesto». Si no se lo pones fácil, muchas visitas se irán sin contactar." } },
  );
  return checks;
}

const BOOKING_RE = /(reserv|pedir cita|pide cita|cita previa|(?<![a-z])book(ing|\b)|calendly|eltenedor|thefork|treatwell|booksy|fresha|doctoralia|simplybook|opentable|covermanager|timify|reservio|setmore|acuityscheduling)/i;
// Teléfono español: 9 cifras empezando por 6, 7, 8 o 9 (con o sin +34 y separadores).
const PHONE_RE = /(?<![\d.,/])(?:(?:\+|00)34[\s-]?)?[6789]\d{2}(?:[\s-]?\d{3}[\s-]?\d{3}|[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2})(?![\d]|[.,]\d)/;

function analyzeContact(root: HTMLElement, text: string, jsRendered: boolean): { checks: InternalCheck[]; hasDirect: boolean; hasContactLink: boolean } {
  const links = root.querySelectorAll("a[href]").map((a) => ({ href: (a.getAttribute("href") ?? "").trim(), text: textOf(a) }));
  const tel = links.filter((l) => /^tel:/i.test(l.href));
  const mail = links.filter((l) => /^mailto:/i.test(l.href));
  const wa = links.filter((l) => /(wa\.me\/|api\.whatsapp\.com|web\.whatsapp\.com|^whatsapp:)/i.test(l.href));
  const forms = root.querySelectorAll("form").filter((f) => {
    const fields = f.querySelectorAll("input,textarea,select").filter((i) => !/^(hidden|submit|button|search)$/i.test(i.getAttribute("type") ?? ""));
    const isSearch = (f.getAttribute("role") ?? "") === "search" || f.querySelectorAll('input[type="search"],input[name="s"],input[name="q"]').length > 0;
    return fields.length >= 2 && !isSearch;
  });
  const booking = links.filter((l) => BOOKING_RE.test(l.href) || BOOKING_RE.test(l.text));
  const bookingIframe = root.querySelectorAll("iframe[src]").some((f) => BOOKING_RE.test(f.getAttribute("src") ?? ""));
  const map = root.querySelectorAll("iframe[src]").some((f) => /google\.[a-z.]+\/maps|maps\.google/i.test(f.getAttribute("src") ?? "")) || links.some((l) => /(google\.[a-z.]+\/maps|maps\.google|goo\.gl\/maps|maps\.app\.goo\.gl)/i.test(l.href));
  const contactLink = links.find((l) => /contact/i.test(l.href) || /^contact/i.test(l.text));
  const phoneInText = text.match(PHONE_RE)?.[0]?.trim();

  const checks: InternalCheck[] = [];
  const hasDirect = tel.length + mail.length + wa.length + forms.length + booking.length > 0 || bookingIframe;

  if (jsRendered && !hasDirect) {
    checks.push({ id: "js", label: "Formas de contacto", status: "unknown", detail: "El contenido se genera con JavaScript y no podemos ver los botones de contacto en el código." });
    return { checks, hasDirect, hasContactLink: Boolean(contactLink) };
  }

  checks.push(
    tel.length
      ? { id: "tel", label: "Teléfono que se puede pulsar", status: "pass", detail: `Enlace de llamada: ${tel[0].href.replace(/^tel:/i, "")}.` }
      : phoneInText
        ? {
            id: "tel",
            label: "Teléfono que se puede pulsar",
            status: "warn",
            detail: `Aparece un teléfono (${phoneInText}) pero no está enlazado para llamar con un toque.`,
            fix: { priority: 7, title: "Haz que llamarte sea un solo toque", text: `Tu teléfono aparece en la web, pero en el móvil no se puede pulsar para llamar. Convertirlo en un botón de llamada es fácil y elimina una barrera para contactarte.` },
          }
        : {
            id: "tel",
            label: "Teléfono que se puede pulsar",
            status: "fail",
            detail: "No hemos encontrado ningún teléfono en la página.",
            fix: { priority: 8, title: "Muestra tu teléfono y que se pueda llamar con un toque", text: "No hemos encontrado tu teléfono en la página principal. Para un negocio local, poder llamar con un solo toque desde el móvil es una de las formas más directas de conseguir clientes." },
          },
  );
  checks.push(
    wa.length
      ? { id: "whatsapp", label: "WhatsApp", status: "pass", detail: "Hay un enlace directo a WhatsApp." }
      : { id: "whatsapp", label: "WhatsApp", status: "warn", detail: "No hay enlace directo a WhatsApp.", fix: { priority: 5, title: "Añade un botón de WhatsApp", text: "Muchos clientes prefieren escribir antes que llamar. Un botón de WhatsApp en tu web les permite preguntar en segundos, sin buscar tu número." } },
  );
  checks.push(
    forms.length
      ? { id: "form", label: "Formulario de contacto", status: "pass", detail: `${plural(forms.length, "formulario encontrado", "formularios encontrados")} en la página.` }
      : contactLink
        ? { id: "form", label: "Formulario de contacto", status: "info", detail: `No hay formulario en esta página, pero sí un enlace a ${quote(contactLink.text || contactLink.href, 50)}.` }
        : { id: "form", label: "Formulario de contacto", status: "warn", detail: "No hay formulario ni enlace a una página de contacto.", fix: { priority: 6, title: "Facilita una forma de escribirte", text: "No hemos encontrado formulario ni página de contacto. Quien te visita fuera de tu horario necesita una manera sencilla de dejarte su mensaje." } },
  );
  checks.push(
    booking.length || bookingIframe
      ? { id: "booking", label: "Reserva o cita online", status: "pass", detail: booking.length ? `Encontrado: ${quote(booking[0].text || booking[0].href, 60)}.` : "Hay un sistema de reservas integrado." }
      : { id: "booking", label: "Reserva o cita online", status: "info", detail: "No hemos encontrado un sistema de reservas o citas. Si tu negocio trabaja con citas, conviene ofrecerlo.", fix: { priority: 3, title: "Si trabajas con citas, deja reservar online", text: "No hemos visto opción de reservar o pedir cita en tu web. Si tu negocio funciona con citas, permitirlo online consigue clientes incluso cuando estás cerrado." } },
  );
  checks.push(
    mail.length
      ? { id: "email", label: "Email que se puede pulsar", status: "pass", detail: `Enlace de email: ${mail[0].href.replace(/^mailto:/i, "").split("?")[0]}.` }
      : { id: "email", label: "Email que se puede pulsar", status: "info", detail: "No hay enlace de email (mailto)." },
  );
  checks.push(
    map
      ? { id: "map", label: "Ubicación en el mapa", status: "pass", detail: "Hay un mapa o enlace a Google Maps." }
      : { id: "map", label: "Ubicación en el mapa", status: "info", detail: "No hay mapa ni enlace a Google Maps. Si atiendes en un local, ayuda a que lleguen." },
  );
  return { checks, hasDirect, hasContactLink: Boolean(contactLink) };
}

/* ------------------------------------------------------------------------ */

export function analyzePage(page: FetchedPage, psi: PageSpeedResult): AnalysisResult {
  const root = parse(page.html, { comment: false, blockTextElements: { script: true, style: true, noscript: true, pre: true } });
  const text = visibleText(root);
  const wordCount = words(text).length;
  const scripts = root.querySelectorAll("script[src]").length + root.querySelectorAll('script[type="module"]').length;
  const appRoot = root.querySelector("#root,#app,#__next,#__nuxt,[data-reactroot],app-root");
  const jsRendered = wordCount < 80 && (scripts > 0 || Boolean(appRoot));

  const warnings: string[] = [];
  if (jsRendered) {
    warnings.push("Esta web genera su contenido con JavaScript. Hemos analizado el código que recibe el navegador al entrar, por lo que algunos apartados no se han podido comprobar.");
  }

  const mobile = analyzeMobile(root);
  const speed = analyzeSpeed(root, page, psi);
  const seo = analyzeSeo(root, page);
  const content = analyzeContent(root, text, jsRendered);
  const contact = analyzeContact(root, text, jsRendered);

  const build = (id: CategoryId, title: string, checks: InternalCheck[], extra?: Partial<Category>): Category & { internal: InternalCheck[] } => {
    const status = extra?.status ?? categoryStatus(checks);
    return {
      id,
      title,
      status,
      summary: extra?.summary ?? summaryFor(status, checks),
      note: extra?.note,
      checks: checks.map(({ fix: _fix, ...c }) => c),
      internal: checks,
    };
  };

  let contactStatus = categoryStatus(contact.checks);
  if (!contact.hasDirect && contactStatus !== "unknown") contactStatus = contact.hasContactLink ? "improve" : "problem";

  const speedStatus: CategoryStatus = psi.available ? (psi.performanceScore >= 90 ? "good" : psi.performanceScore >= 50 ? "improve" : "problem") : "unknown";

  const cats = [
    build("mobile", "Adaptación a móviles", mobile, {
      note: "Comprobación del código de la página. No incluye una prueba visual en un móvil real.",
    }),
    build("speed", "Velocidad de carga", speed, {
      status: speedStatus,
      summary: psi.available ? `Google PageSpeed: ${psi.performanceScore}/100 en móvil.` : "Velocidad real no medida. Abajo tienes los datos técnicos que sí hemos comprobado.",
      note: psi.available ? "Medición de laboratorio de Google PageSpeed Insights (móvil). Puede variar algo entre análisis." : undefined,
    }),
    build("seo", "SEO básico", seo),
    build("content", "Claridad del contenido", content, {
      note: jsRendered ? undefined : "Lo que medimos es la estructura y la legibilidad, no la calidad del mensaje: eso lo valoramos en la auditoría personalizada.",
    }),
    build("contact", "Facilidad para contactar o reservar", contact.checks, { status: contactStatus, summary: contactStatus === "unknown" ? undefined : contact.hasDirect ? summaryFor(contactStatus, contact.checks) : contact.hasContactLink ? "En esta página no hay ninguna forma directa de contactar; hay que ir a otra página." : "No hemos encontrado ninguna forma de contactar en esta página." }),
  ];

  // Las 3 mejoras más importantes: solo a partir de problemas detectados.
  const candidates = cats.flatMap((c) =>
    c.internal
      .filter((ch) => ch.fix && (ch.status === "fail" || ch.status === "warn" || ch.status === "info"))
      .map((ch) => ({ cat: c.id, fix: ch.fix!, score: ch.fix!.priority + (ch.status === "fail" ? 3 : ch.status === "warn" ? 1 : -2) })),
  );
  candidates.sort((a, b) => b.score - a.score);
  const picked: typeof candidates = [];
  for (const c of candidates) {
    if (picked.length >= 3) break;
    if (picked.filter((p) => p.cat === c.cat).length >= 2) continue;
    picked.push(c);
  }
  for (const c of candidates) {
    if (picked.length >= 3) break;
    if (!picked.includes(c)) picked.push(c);
  }

  return {
    categories: cats.map(({ internal: _i, ...c }) => c),
    improvements: picked.map((p) => ({ category: p.cat, title: p.fix.title, text: p.fix.text })),
    warnings,
    page: { title: clean(root.querySelector("title")?.textContent) || null, words: wordCount },
  };
}
