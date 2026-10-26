# DS Reels · Node 22 + Chrome Headless Shell (Remotion) + ffmpeg. Lo construye EasyPanel (servicio `reels`, proyecto coach-dee).
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates fonts-liberation \
    libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2 libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 \
    libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 libxshmfence1 libx11-6 libxext6 libxcb1 libglib2.0-0 libexpat1 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --loglevel=error
COPY remotion.config.ts tsconfig.json tracks.json server.mjs pipeline.mjs ./
COPY remotion ./remotion
COPY public ./public
RUN npx remotion browser ensure && npx remotion bundle remotion/index.ts --out-dir build --log=warn
ENV PORT=3000 PB_STORAGE=/pb_storage OUT_DIR=/out WORK_DIR=/work RENDER_CONCURRENCY=2
VOLUME ["/work"]
EXPOSE 3000
CMD ["node", "server.mjs"]
