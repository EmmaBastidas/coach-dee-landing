# Static site served by nginx — usado por EasyPanel cuando la landing
# se aloje en el VPS (Carril 2). En el hosting compartido (Carril 1) no
# se usa: ahí los archivos van directos a public_html.
FROM nginx:alpine
COPY . /usr/share/nginx/html
