# Memoria del proyecto — Santoyo's Concrete Work

Notas para quien trabaje en este repo (personas o Claude): qué es la app, reglas que
no son obvias leyendo un solo archivo y cómo probar sin romper nada.
Última actualización: 2026-11-11.

## Qué es

- PWA en HTML/CSS/JS puro: **sin build, sin framework, sin `package.json`**. Las
  librerías (jsPDF, html2canvas, Supabase) están copiadas en `assets/vendor/`.
- Flujo: **Cálculo → Cotizaciones → Invoice → Finanzas**, más la pestaña
  **Tráfico** (estadísticas del sitio santoyosconcrete.com, ver abajo).
- **Hacer push a `main` = publicar en producción** (GitHub Pages →
  app.santoyosconcrete.com). Los teléfonos con la app instalada lo reciben.
- Supabase es un espacio compartido (RLS: cualquier usuario autenticado ve todo).
  `localStorage` es la fuente de verdad local; `js/cloud.js` sincroniza con
  "gana la escritura más reciente" por `updatedAt`. La sesión dura 15 días.
- `.github/workflows/keepalive.yml` hace ping a Supabase cada 2 días para que el
  plan gratuito no pause el proyecto.

## Mapa de archivos

| Archivo | Qué hace |
|---|---|
| `js/calc.js` | Fórmulas puras (iguales al Excel) + `quoteCharged()` |
| `js/materials.js` | Calculadora: sectores de concreto, footing y demolición, materiales, totales |
| `js/data.js` | Precios por defecto, casillas del invoice (`DESC_ITEMS`), datos de la empresa |
| `js/quotes.js` | Lista de cotizaciones (pendiente → aceptada → confirmada) |
| `js/invoice.js` | Invoice: descripción con casillas, firmas, PDF/imagen |
| `js/finance.js` | Trabajos confirmados: pagos, saldo, costos, ganancia |
| `js/filters.js` | Búsqueda / mes / semana para Cotizaciones y Finanzas |
| `js/i18n.js` | Textos ES/EN |
| `js/storage.js` | Guardado en `localStorage` (`santoyo.*`) |
| `js/cloud.js` | Login + sincronización con Supabase |
| `js/config.js` | URL y anon key de Supabase (públicas por diseño) |
| `js/traffic.js` | Pestaña Tráfico: lee `santoyosconcrete.com/api/traffic` y lo pinta |
| `js/app.js` | Navegación, ajustes, tema, idioma |

> El `README.md` está desactualizado (menciona `accounting.js` y `logo.svg`, que ya
> no existen). Esta tabla es la vigente.

## Reglas al hacer cambios

1. **Subir la versión del cache** en `service-worker.js` (`santoyo-vNN`) en cada
   cambio que se publique; si no, los teléfonos siguen con la versión vieja.
2. **El invoice siempre va en inglés** (convención de la marca). La interfaz es
   bilingüe ES/EN: todo texto nuevo va en `js/i18n.js` en los dos idiomas.
3. **Total cobrado de una cotización = `Calc.quoteCharged(calc)`**
   (Precio Sq.Ft. + demolición). Úsalo donde se necesite lo cobrado (lista de
   cotizaciones, TOTAL del invoice, Finanzas), no `sqftTotal` solo.
4. **Secciones de la calculadora** (concreto, footing, demolición) comparten
   `sectorRowsHTML` / `bindSectorList` en `js/materials.js`. Los ids de sector
   llevan prefijo `s_` / `f_` / `d_`.
5. **Casillas de la descripción del invoice** (`DESC_ITEMS` en `js/data.js`): el
   bloque se regenera desde las casillas; solo se quita desmarcando.
   - *Footing* y *Concrete Demolition* escriben una línea por sector.
   - **La demolición en el invoice lleva solo los pies cuadrados, nunca el precio**
     (pedido del cliente): `Concrete Demolition: 20 ft x 10 ft x 6 in = 200.00 sq ft`.
6. **Las cotizaciones viejas no tienen los campos nuevos**: siempre poner un valor
   por defecto (0 / vacío) al leer.

## Decisiones del cliente

- 2026-11-10 — **Demolición de concreto**: Largo (ft) × Ancho (ft), grosor en lista
  desplegable **4", 5", 6", 7", 8"** (4" por defecto), precio propio por Sq.Ft. El
  precio **se suma a la cotización**. El grosor no entra en el cálculo, solo se
  muestra en el invoice.

## Pestaña Tráfico (sitio santoyosconcrete.com)

- El sitio es **otro repo**: `cristopherval/Santoyo---Landing` (Astro en Cloudflare
  Pages, con **otro** proyecto de Supabase). Ahí vive la función
  `functions/api/traffic.ts`, que es la única que habla con Google.
- La misma función sirve a **dos paneles**: el `/admin` del sitio
  (`TrafficPanel.tsx`) y esta app (`js/traffic.js`). Si cambias qué se muestra en
  uno, cambia el otro.
- La app manda su token de Supabase con `X-Panel: app`; la función lo valida
  contra el Supabase de la app (`APP_SUPABASE_URL` / `APP_SUPABASE_ANON_KEY` en
  Cloudflare). CORS solo permite `https://app.santoyosconcrete.com`. La CSP de
  `index.html` permite `https://santoyosconcrete.com` en `connect-src`.
- Google:
  - GA4: cuenta **Santoyo's Concrete Work**, propiedad `santoyosconcrete.com`,
    ID de propiedad `563806005`, medición `G-DLQX7FRN5B`. (En la misma cuenta de
    Google está la propiedad de la **barbería** — no tocarla.)
  - Eventos de conversión que manda el sitio: `generate_lead` (/thank-you),
    `click_call`, `click_sms`, `click_email`.
  - Cuenta de servicio de solo lectura:
    `santoyo-reader@santoyo-analytics.iam.gserviceaccount.com` (proyecto de
    Google Cloud `santoyo-analytics`). Tiene **Lector** en GA4 y **Restringido**
    en Search Console. Su clave JSON está solo en Cloudflare (`GOOGLE_SA_JSON`).
  - La organización de Google Cloud bloquea crear claves de cuentas de servicio
    (`iam.disableServiceAccountKeyCreation`). Para crear otra hay que desactivarla
    un momento y volver a activarla.
- Variables en Cloudflare Pages (sitio): `GOOGLE_SA_JSON` y `PSI_API_KEY` (secret),
  `GA4_PROPERTY_ID`, `APP_SUPABASE_URL`, `APP_SUPABASE_ANON_KEY`.
- Caché: GA4 y Search Console 15 min, PageSpeed 12 h. Search Console publica con
  2–3 días de retraso.

## Cómo probar sin tocar producción

No hay suite de pruebas. Lo que funciona:

- Servir la carpeta con un servidor local y **reemplazar `js/config.js` por uno con
  `SUPABASE_URL` y `SUPABASE_ANON_KEY` vacíos**: la app corre 100 % local (sin login,
  sin escribir en la nube). **Nunca probar contra el Supabase real**: son datos
  reales del negocio.
- Para pruebas automáticas: `puppeteer-core` (fuera del repo) manejando el Chrome
  instalado. Ruido esperado en consola: el aviso de CSP `frame-ancestors` en
  `<meta>` y el 404 del service worker si se bloquea.
- Revisar capturas de pantalla, no solo números (así se encontró una unidad "yd³"
  mal puesta en los sectores de demolición).
