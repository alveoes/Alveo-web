# Analizador Web de ALVEO

Herramienta gratuita: el visitante escribe la dirección de su web y recibe un
diagnóstico (móvil, velocidad, SEO básico, claridad del contenido y facilidad
de contacto/reserva), las 3 mejoras más importantes y el botón
«Solicitar auditoría gratuita con ALVEO».

Vive dentro del servidor existente `@workspace/api-server`:

| Ruta | Qué es |
| --- | --- |
| `GET /analizador/` | Página pública (HTML + CSS + JS sin dependencias) |
| `POST /api/analyze` | `{ "url": "tunegocio.es" }` → diagnóstico en JSON |
| `GET /api/analyze/status` | Indica si PageSpeed está activado |

## Archivos

- `public/analizador/` — página (`index.html`, `styles.css`, `app.js`, logo). Mismos colores, tipografías (Manrope + DM Mono) y estilos de botones que la web principal.
- `src/routes/analyze.ts` — endpoint.
- `src/lib/safe-fetch.ts` — descarga segura (anti-SSRF).
- `src/lib/html-analysis.ts` — comprobaciones sobre el HTML real.
- `src/lib/pagespeed.ts` — Google PageSpeed Insights (opcional).
- `src/lib/rate-limit.ts` — límites de uso.
- `test/analysis.test.mjs` — pruebas (`pnpm --filter @workspace/api-server run test`).

## De dónde sale cada dato (no se inventa nada)

- **Velocidad**: puntuación y métricas reales de Google PageSpeed Insights (móvil). Sin clave API se muestra «No comprobado», junto con los datos técnicos que sí se miden: tiempo de respuesta del servidor, compresión, peso del HTML, carga diferida de imágenes y redirecciones.
- **Móvil, SEO, contenido y contacto**: se leen del HTML que recibe un visitante. Cada punto enseña lo encontrado (título, descripción, teléfono, etc.).
- Si la web genera su contenido con JavaScript (React, Wix…), se avisa y esos apartados salen como «No comprobado».
- Si la web no responde, bloquea bots o da error, se muestra un mensaje claro y no se genera diagnóstico.
- Las 3 mejoras salen solo de problemas detectados. Si no hay, no se rellenan.

## Seguridad

- Solo `http`/`https`, puertos 80/443, sin usuario ni contraseña en la URL.
- Se resuelve el DNS y se rechaza cualquier IP privada, local, de metadatos (169.254.169.254) o reservada, en IPv4, IPv6 e IPv4 mapeada. La conexión usa la IP ya validada, lo que impide el DNS rebinding.
- Las redirecciones se siguen a mano (máximo 5) y se revalida cada salto.
- Límite de 12 s y 3 MB (también tras descomprimir).
- Cuerpo de petición de 10 KB como máximo. Nunca se piden contraseñas ni accesos.
- Lo que viene de webs externas se pinta con `textContent` (sin XSS).

## Variables de entorno

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `PAGESPEED_API_KEY` | — | Activa la medición de velocidad con Google |
| `ANALYZE_LIMIT_PER_10MIN` | `5` | Análisis por IP cada 10 minutos |
| `ANALYZE_LIMIT_PER_DAY` | `25` | Análisis por IP al día |
| `ANALYZE_MAX_CONCURRENT` | `4` | Análisis simultáneos en total |
| `TRUST_PROXY_HOPS` | `1` | Proxies delante del servidor (Replit: 1). Necesario para conocer la IP real |
| `ALLOWED_ORIGINS` | — | Si la página se sirve desde otro dominio, lista separada por comas, p. ej. `https://alveoagencia.es,https://www.alveoagencia.es` |

### Obtener la clave de PageSpeed (gratis)

1. Entra en https://console.cloud.google.com/ con la cuenta de Google de ALVEO y crea un proyecto (p. ej. «ALVEO Analizador»).
2. En «APIs y servicios → Biblioteca», busca **PageSpeed Insights API** y pulsa «Habilitar».
3. En «APIs y servicios → Credenciales», pulsa «Crear credenciales → Clave de API».
4. Edita la clave y, en «Restricciones de API», limítala a *PageSpeed Insights API*.
5. En Replit, abre **Secrets** y añade `PAGESPEED_API_KEY` con esa clave. Vuelve a desplegar.

La cuota gratuita es de 25.000 consultas al día. Los resultados se guardan 15 minutos para no repetir consultas.

## Probar en local

```bash
pnpm install
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run dev    # PORT=8080
```

Abre `http://localhost:8080/analizador/`.

## Ajustes de la página

En `public/analizador/index.html`, en la etiqueta `<body>`:

- `data-contact-url`: destino del botón de auditoría (por defecto `https://alveoagencia.es/#contacto`).
- `data-api-base`: dejar vacío si la página y la API están en el mismo dominio. Si la página se aloja en otro sitio, pon la URL del servidor (p. ej. `https://analizador.alveoagencia.es`) y configura `ALLOWED_ORIGINS`.

## Límites conocidos de esta versión

- Se analiza solo la página indicada, no toda la web.
- El diseño adaptable se comprueba en el código; no hay prueba visual en un móvil real.
- La detección de teléfono en texto está pensada para números españoles.
- Los límites de uso se guardan en memoria: si se escala a varias instancias, cada una aplica el suyo.
