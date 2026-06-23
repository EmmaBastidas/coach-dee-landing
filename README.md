# coach-dee-landing

Landing v2 de **Coach Demetrius Santos** — `https://www.coachdsantos.com`

Sitio **estático** (un solo `index.html` + `images/`, sin paso de build). Carga Tailwind, Alpine y
las fuentes desde CDN en runtime.

## Estructura
- `index.html` — la landing completa.
- `images/` — fotos optimizadas, logo y favicon.
- `Dockerfile` — solo para desplegar en el VPS vía EasyPanel (nginx). No se usa en hosting compartido.

## Deploy
- **Hosting compartido (Hostinger):** subir `index.html` + `images/` a `public_html`.
- **VPS / EasyPanel:** servicio App desde este repo; usa el `Dockerfile` (nginx) automáticamente.

## Formularios y contacto
- Formularios (Coaching + Nutrition) vía **Web3Forms** (access key embebida; reply-to = email del atleta).
- Botón flotante de **WhatsApp** → `wa.me/19736518734`.

Fuente original: `Coach_dee/site/v2/`.
