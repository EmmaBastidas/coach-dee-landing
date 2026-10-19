# DS Hub · imagen del servicio `lab` (PocketBase + ffmpeg) — 2026-10-19
# Misma PocketBase 0.40.4 de siempre (ghcr.io/muchobien/pocketbase) más ffmpeg/ffprobe para que el
# worker de pb_hooks/ds-jobs.pb.js comprima los videos que Dee sube (clips de atletas, hero) en el servidor.
# EasyPanel construye esta imagen desde GitHub (repo coach-dee-landing, carpeta hub-image). Vive aquí, y no en
# el repo privado del proyecto, porque EasyPanel necesita un repo público y este archivo no tiene secretos.
# Volúmenes, entrypoint y puerto no cambian: son los de la imagen base.
FROM ghcr.io/muchobien/pocketbase:0.40.4
RUN apk add --no-cache ffmpeg
