# DS Reels · servicio de render (paso 2 del Content del Hub)

Monta reels 9:16 de marca a partir de clips del banco de Dee: gancho cinético, frases que entran al beat, cortes entre clips
en los compases, lavado B/N, logo DS, cierre con coachdsantos.com y música Pixabay. Remotion + ffmpeg, en el VPS de Dee.

- `server.mjs` · API interna (`POST /render`, `GET /health`). PocketBase lo llama desde `pb_hooks/ds-jobs.pb.js` (jobs `kind=reel`).
- `pipeline.mjs` · `planTimeline` (beats → frames), `normalize` (ffmpeg 1080×1920, 30 fps, lavado), `runJob` (Remotion → mp4 + póster → callback `/api/ds/reel/done`).
- `remotion/` · composición `Reel` (props = línea de tiempo), `ui/Text.tsx` (misma tipografía cinética del video de lanzamiento).
- `tracks.json` · pistas, BPM y desde qué compás arranca cada una (el beat lleno cae al terminar el gancho).
- `public/` · fuentes autoalojadas (Saira Condensed 800, Geist Mono 500, Switzer), logo, música (licencia en `audio/LICENSE.txt`).

Despliegue: copia de esta carpeta en `coach-dee-landing/reels-image` (repo público que EasyPanel construye) → servicio `reels`
sin dominio, en la red del proyecto; montajes bind al storage de PocketBase (solo lectura en la práctica) y a `pb_data/ds-render`
(salida). Variables: `DS_REELS_SECRET` (mismo valor en el servicio `lab`), `PB_STORAGE`, `OUT_DIR`. Documentación completa en
`hub/docs/README-ES.md` (sección "Reels").

Prueba local: `npm i && npm run bundle && PB_STORAGE=... OUT_DIR=... WORK_DIR=... node server.mjs`, luego `POST /render`.
