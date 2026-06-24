# Static site served by nginx — usado por EasyPanel cuando la landing
# se aloje en el VPS (Carril 2). En el hosting compartido (Carril 1) no
# se usa: ahí los archivos van directos a public_html.
FROM nginx:alpine

# Config de nginx con cabeceras de seguridad + CSP (ver nginx.conf).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar solo los assets del sitio al web root (no el Dockerfile, nginx.conf,
# README ni .git — .dockerignore los excluye del contexto de build).
COPY index.html /usr/share/nginx/html/index.html
COPY link /usr/share/nginx/html/link
COPY images /usr/share/nginx/html/images
