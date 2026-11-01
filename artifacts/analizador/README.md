# Analizador de presencia digital · ALVEO

Herramienta gratuita para negocios de Granada (capital y provincia). El visitante introduce los enlaces de sus perfiles y recibe una **puntuación sobre 100** por plataforma y por apartado. Al terminar, puede pulsar **«Contactar con ALVEO»** para abrir WhatsApp.

- Sin registro, sin contraseñas y sin pedir teléfono ni correo.
- Sin auditorías escritas, listados de problemas ni recomendaciones: solo puntuaciones.
- Sin seguimiento publicitario. Las fuentes tipográficas se sirven desde el propio servidor, sin Google Fonts.
- Se publica en `/analiza-tu-negocio`. No modifica la web actual.

## Estado de las integraciones

| Plataforma | Estado | Fuente | Requisitos |
|---|---|---|---|
| **Google (Perfil de Empresa)** | **Funcional; falta la clave** | Places API (New): Text Search + Place Details | Clave de API con facturación activa en Google Cloud |
| **Instagram** | **Parcial; faltan las credenciales** | Instagram Graph API, *Business Discovery* | App de Meta y cuenta profesional de ALVEO vinculada. Solo puede consultar cuentas **profesionales** |
| **TikTok** | **Pendiente** | — | No existe una vía oficial para leer perfiles de terceros sin que inicien sesión (ver abajo) |

Sin credenciales, la plataforma aparece como «No se ha podido analizar» con su motivo. Nunca se muestran datos de demostración.

### Qué limita cada plataforma

**Google**
- La API **no devuelve las respuestas del propietario**. Ese apartado aparece siempre como «Datos insuficientes», por eso la cobertura de Google es siempre «parcial».
- Devuelve como máximo 5 reseñas, las «más relevantes», no las más recientes. La actualidad de las reseñas solo se puede *confirmar* (hay una de los últimos 180 días), nunca descartar.
- Devuelve como máximo 10 fotos, así que el criterio de fotos tiene ese tope.
- Para identificar la ficha:
  - Si el enlace contiene el identificador interno de la ficha (CID), solo se acepta un resultado con ese mismo CID.
  - Si no lo contiene, se exige que coincidan el nombre y las coordenadas (a menos de 250 m).
  - Si no hay coincidencia segura, la ficha no se analiza.
- Los enlaces cortos (`maps.app.goo.gl`, `share.google`, `g.page`, `goo.gl/maps`) se resuelven leyendo solo las cabeceras de redirección:
  - como máximo 5 saltos;
  - solo HTTPS;
  - solo dominios de Google;
  - nunca se descarga la página.
- Las fichas que no están en la provincia de Granada no se analizan.

**Instagram**
- *Business Discovery* devuelve nombre, biografía, enlace, foto, número de publicaciones y las últimas 25 publicaciones (fecha y texto).
- **No** devuelve categoría, dirección ni botones de contacto o reserva. Si esa información no aparece en la biografía, el criterio queda como «Datos insuficientes» y no penaliza.
- Las cuentas personales no se pueden consultar.
- No se usan los seguidores.

**TikTok**
- La *Display API* exige que el propio usuario inicie sesión, algo que este proyecto descarta.
- La *Research API* está limitada a investigación académica sin ánimo de lucro.
- Extraer el HTML de los perfiles iría contra sus condiciones de uso.
- La rúbrica de TikTok está definida en `src/rubric.js`, pero no se aplica hasta que exista una fuente permitida.

## Rúbrica (versión `2026.11-v1`)

Reglas generales:

- Cada subcriterio vale de 0 a 1, o bien *sin datos* o *no aplica*.
- Lo que no se puede comprobar **se excluye y no cuenta como cero**. La puntuación se renormaliza sobre lo comprobado.
- Un apartado se puntúa si los subcriterios comprobados suman al menos el **50 %** de su peso aplicable.
- Una plataforma recibe puntuación global si los apartados con datos suman al menos el **60 %** del peso. Si no llega, se muestra «Datos insuficientes».
- La cobertura es «completa» solo si se han comprobado todos los apartados. En otro caso es «parcial · X de Y apartados comprobados».
- Si el negocio no tiene una plataforma, aparece «No incluido. No resta puntos».
- No hay puntuación global conjunta entre plataformas.

### Google (100)

| Apartado | Peso | Subcriterios |
|---|---|---|
| Completitud de la ficha | 10 | Una sexta parte cada uno: dirección con calle (sin calle → sin datos), teléfono, web, horario, categoría, fotos |
| Horarios | 15 | Horario semanal publicado |
| Categoría y servicios | 10 | Categoría principal específica: 60 (genérica = 0,3). Categorías adicionales: 40. Opciones de servicio declaradas: 30, **solo hostelería** |
| Fotos | 15 | 0 → 0; 1–2 → 0,4; 3–5 → 0,7; 6–9 → 0,85; 10 → 1 |
| Reseñas | 30 | Valoración: 40 (3,0 = 0 y 4,8 o más = 1, lineal; no aplica sin reseñas). Número de reseñas: 35 (0 / 1–9 / 10–49 / 50–149 / 150+ → 0 / 0,3 / 0,6 / 0,8 / 1). Reseña de los últimos 180 días: 25 (solo confirma) |
| Respuestas del propietario | 0 | No disponible en la API: siempre «Datos insuficientes» |
| Contacto y web | 20 | Teléfono: 50. Web: 50 (si es una red social, 0,6) |

### Instagram (100)

| Apartado | Peso | Subcriterios |
|---|---|---|
| Presentación | 25 | Nombre: 20. Foto: 20. Biografía presente: 30. Biografía desarrollada: 30 (menos de 30 caracteres → 0; 30–59 → 0,5; 60 o más → 1) |
| Identificación y ubicación | 20 | Menciona el municipio o Granada en el nombre o la biografía: 60. Dirección en la biografía: 40 (si no aparece → sin datos) |
| Productos o servicios | 20 | Términos de la oferta del sector en la biografía: 50. En las últimas 12 publicaciones: 50 (3 o más → 1; 1–2 → 0,5) |
| Actividad reciente | 20 | Última publicación: 70 (≤30 / 90 / 180 / 365 días → 1 / 0,7 / 0,4 / 0,2). Publicaciones en 90 días: 30 (0 / 1–2 / 3–5 / 6+ → 0 / 0,4 / 0,7 / 1). No se exige publicar a diario |
| Contacto y reservas | 15 | Enlace en el perfil: 50. Teléfono, WhatsApp, email o palabras como «reservas» o «cita» en la biografía: 50 (si no aparecen → sin datos) |

### TikTok (pendiente)

Presentación 20 · Identificación 20 · Actividad 20 · Oferta 25 · Contacto 15.

Los términos de oferta por sector están en `src/sectors.js`. En el sector «Otro» también cuentan las palabras que escribe el propio negocio. La rúbrica pública se puede consultar en `GET /analiza-tu-negocio/api/rubrica`.

Los niveles de texto que acompañan a la cifra (para no depender del color) son: ≥80 «Muy completa», 60–79 «Buena base», 40–59 «Mejorable», <40 «Mucho margen de mejora».

## Registro interno (justificación de cada cálculo)

Cada análisis añade una línea a `data/analisis.jsonl` con:
- id, fecha y versión de la rúbrica;
- nombre, sector y municipio del negocio, y los enlaces analizados;
- por plataforma: estado, motivo, fecha de los datos, método de identificación de la ficha, **evidencias** y **todos los subcriterios** con su peso, su valor y el texto de la evidencia.

**No** se guardan IP, textos ni autores de reseñas, ni datos de contacto del visitante. Las líneas con más de `AUDIT_RETENTION_DAYS` días (365 por defecto) se eliminan al arrancar.

## Seguridad, límites y costes

- Las claves solo están en variables de entorno del servidor y nunca llegan al navegador. Las URLs con tokens no se registran.
- Los enlaces se validan contra una lista cerrada de dominios. No se aceptan credenciales en la URL, puertos ajenos ni rutas de publicaciones.
- Las llamadas a las API no siguen redirecciones y tienen un límite de 8 s y 2 MB.
- Límites por IP: 5 análisis cada 10 minutos y 20 al día. La IP se guarda como hash en memoria, con una sal que cambia en cada arranque.
- Como máximo 4 análisis simultáneos. El cuerpo de la petición está limitado a 8 KB, se comprueba el `Origin` y se exige `Content-Type` JSON.
- Topes diarios de llamadas externas: `GOOGLE_DAILY_BUDGET` (30) e `INSTAGRAM_DAILY_BUDGET` (150).
- Hay una caché de 24 h por enlace o usuario. Si se reutiliza, el resultado muestra «Datos consultados el …».
- Cabeceras de seguridad: CSP estricta (sin scripts ni estilos en línea), `nosniff`, `Referrer-Policy` y `Permissions-Policy`.

### Costes externos

**Google Maps Platform** (de pago, con uso gratuito mensual por SKU). Desde marzo de 2025, cada SKU tiene su propio cupo gratuito al mes: 10 000 (Essentials), 5 000 (Pro) y 1 000 (Enterprise).
- Cada análisis nuevo hace como máximo:
  - 1 *Text Search* (campos de identificación, nivel Pro). Se omite si el enlace trae el `place_id`.
  - 1 *Place Details*. Pide valoración, reseñas, teléfono y web, así que se factura como **Enterprise + Atmosphere**.
- Con el tope por defecto (30 análisis al día, unos 900 al mes) se queda por debajo del cupo de 1 000 de los SKU Enterprise.
- Precio por encima del cupo:
  - **Text Search** Enterprise + Atmosphere: lo he confirmado en 40 $ por cada 1 000 llamadas.
  - **Place Details** Enterprise + Atmosphere: **no he podido confirmarlo**.

  Consulta https://developers.google.com/maps/billing-and-pricing/pricing antes de activar la clave.
- Recomendado: configura en Google Cloud una **cuota diaria** y una **alerta de presupuesto**.

**Meta / Instagram Graph API**: sin coste por llamada. Está sujeta a los límites de uso por hora de Meta, que no he verificado.

**TikTok**: sin integración, sin coste.

## Configuración

### Google
1. En Google Cloud Console, crea un proyecto y activa la facturación.
2. Activa **Places API (New)**.
3. Crea una clave de API y restríngela a *Places API (New)*. Si el servidor tiene una IP fija, restríngela también por IP.
4. Fija cuotas diarias y alertas de presupuesto.
5. Añade `GOOGLE_PLACES_API_KEY` como secreto del servidor.

### Instagram
1. La cuenta de Instagram de ALVEO debe ser **profesional** y estar vinculada a una página de Facebook.
2. En developers.facebook.com, crea una app de tipo *Business* y añade el producto Instagram (*API con inicio de sesión de Facebook*).
3. Genera un token con `instagram_basic`, `pages_show_list`, `pages_read_engagement` e `instagram_manage_insights`. Mejor un token de **usuario del sistema** de Business Manager, que no caduca. Si usas un token de usuario de larga duración (60 días), tendrás que renovarlo.
4. Obtén el ID de la cuenta:
   - `GET /me/accounts` devuelve el ID de la página;
   - `GET /{id-página}?fields=instagram_business_account` devuelve `META_IG_USER_ID`.
5. Añade `META_IG_USER_ID` y `META_ACCESS_TOKEN` como secretos.
6. Comprueba en el panel de la app si Meta exige acceso avanzado o revisión de la app para tu caso.

Todas las variables están documentadas en `.env.example`.

## Probar en local

Requiere Node.js 20 o superior. No hay dependencias que instalar.

```bash
cd artifacts/analizador
npm start
```

Abre http://localhost:8090/analiza-tu-negocio/

Con claves reales:

```bash
GOOGLE_PLACES_API_KEY=... META_IG_USER_ID=... META_ACCESS_TOKEN=... npm start
```

Tests:

```bash
npm test
```

```bash
npm run test:e2e
```

- `npm test` lanza los tests unitarios: validación de enlaces, redirecciones seguras, rúbrica, entrada y WhatsApp.
- `npm run test:e2e` lanza el navegador con Playwright contra APIs simuladas en local. Las URL simuladas solo se aceptan con `NODE_ENV=test`, y los datos ficticios de los tests nunca se cargan en producción.

## Publicación en `/analiza-tu-negocio`

El servidor es Node puro y sirve la página y la API bajo `BASE_PATH`. Necesita un proceso Node, no un alojamiento solo estático, porque el progreso se transmite en tiempo real y las claves deben quedarse en el servidor.

- **Replit**: `.replit-artifact/artifact.toml` registra el servicio en la ruta `/analiza-tu-negocio` (puerto 8090). Hay que añadir los secretos y desplegar.
- **Otro servidor (VPS)**: `node src/server.js` con `TRUST_PROXY=1` detrás de Nginx:
  ```nginx
  location /analiza-tu-negocio {
      proxy_pass http://127.0.0.1:8090;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_buffering off;   # progreso en tiempo real
  }
  ```

La carpeta `data/` debe ser persistente si se quiere conservar el registro interno.
