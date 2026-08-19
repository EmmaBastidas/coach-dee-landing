# Tests E2E de la landing

`e2e-wizard.js` prueba el wizard de Coaching completo (validación por pasos,
atrás/adelante, envío con Web3Forms SIMULADO — nunca manda email real) y el
slider de testimonios, contra un servidor local.

## Correr
```bash
cd site-local && python3 -m http.server 8899   # servir la landing
npm i puppeteer-core                            # usa el Chrome instalado
node tests/e2e-wizard.js
```
OJO: Web3Forms bloquea navegadores automatizados (UA HeadlessChrome → CORS);
para pruebas de entrega real hay que spoofear un User-Agent de Chrome normal
y apuntar a https://www.coachdsantos.com (el key está atado a ese dominio).
Estos tests NO están en la imagen Docker (el Dockerfile solo copia el sitio).
