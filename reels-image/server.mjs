// DS Reels · servicio HTTP interno (sin dominio público; solo lo llama PocketBase dentro de la red de EasyPanel).
//   POST /render   {job_id, post_id, spec, clips:[{id,path}], callback}  + X-DS-Secret  → 202 y se encola
//   GET  /health   → {ok, queue, busy}
//   GET  /work/<job>/<archivo>.mp4 → tramos normalizados (los lee el Chrome de Remotion dentro del contenedor)
// Al terminar (o fallar) avisa a PocketBase: POST callback {job_id, ok, file, poster, duration, bytes, error} + X-DS-Secret.
import http from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { runJob } from "./pipeline.mjs";

const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.DS_REELS_SECRET || "";
const STORAGE = process.env.PB_STORAGE || "/pb_storage";
const OUT = process.env.OUT_DIR || "/out";
const WORK = process.env.WORK_DIR || "/work";
const SERVE = process.env.SERVE_URL || path.resolve("build");
const CONCURRENCY = Number(process.env.RENDER_CONCURRENCY || 1); // en el VPS el contenedor tiene cpuLimit 1.7 → Remotion solo admite 1
const log = (...a) => console.log(new Date().toISOString(), ...a);
if (!SECRET) log("WARN: DS_REELS_SECRET vacío: se aceptará cualquier petición (solo para pruebas locales)");

const queue = []; let busy = null;
async function pump() {
  if (busy || !queue.length) return;
  const job = queue.shift(); busy = job;
  const ctx = { storage: STORAGE, outDir: OUT, workDir: WORK, serveUrl: SERVE, baseUrl: `http://127.0.0.1:${PORT}`, concurrency: CONCURRENCY, log: (m) => log(`[${job.job_id}] ${m}`) };
  let result;
  try { result = await runJob(job, ctx); }
  catch (err) { log(`[${job.job_id}] FAILED ${String(err).slice(0, 600)}`); result = { ok: false, error: String(err && err.message || err).slice(0, 1500) }; }
  if (job.callback) await notify(job, result);
  busy = null; setImmediate(pump);
}
async function notify(job, result) {
  const body = JSON.stringify({ job_id: job.job_id, post_id: job.post_id, ...result });
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(job.callback, { method: "POST", headers: { "Content-Type": "application/json", "X-DS-Secret": SECRET }, body, signal: AbortSignal.timeout(30000) });
      log(`[${job.job_id}] callback → ${r.status}`);
      if (r.ok) return;
    } catch (err) { log(`[${job.job_id}] callback error: ${String(err).slice(0, 200)}`); }
    await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
  }
}

const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, queue: queue.length, busy: busy ? busy.job_id : null });
  if (req.method === "GET" && url.pathname.startsWith("/work/")) {
    const m = /^\/work\/([A-Za-z0-9_-]+)\/(seg\d+\.mp4)$/.exec(url.pathname);
    if (!m) return json(res, 404, { error: "not found" });
    const file = path.join(WORK, m[1], m[2]);
    let st; try { st = await fs.stat(file); } catch { return json(res, 404, { error: "not found" }); }
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    let start = 0, end = st.size - 1;
    if (range) { if (range[1]) start = Number(range[1]); if (range[2]) end = Number(range[2]); if (!range[1] && range[2]) { start = st.size - Number(range[2]); end = st.size - 1; } }
    if (start > end || end >= st.size) { res.writeHead(416, { "Content-Range": `bytes */${st.size}` }); return res.end(); }
    res.writeHead(range ? 206 : 200, { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Content-Length": end - start + 1, ...(range ? { "Content-Range": `bytes ${start}-${end}/${st.size}` } : {}) });
    return createReadStream(file, { start, end }).pipe(res);
  }
  if (req.method === "POST" && url.pathname === "/render") {
    if (SECRET && req.headers["x-ds-secret"] !== SECRET) return json(res, 401, { error: "bad secret" });
    let body = ""; for await (const chunk of req) { body += chunk; if (body.length > 200000) return json(res, 413, { error: "too big" }); }
    let job; try { job = JSON.parse(body); } catch { return json(res, 400, { error: "bad json" }); }
    if (!job || !/^[A-Za-z0-9_-]{6,40}$/.test(String(job.job_id || ""))) return json(res, 400, { error: "job_id required" });
    if (!Array.isArray(job.clips) || !job.clips.length || job.clips.length > 4) return json(res, 400, { error: "1–4 clips" });
    if (job.callback && !/^https?:\/\//.test(job.callback)) return json(res, 400, { error: "bad callback" });
    const dup = (busy && busy.job_id === job.job_id) || queue.some((j) => j.job_id === job.job_id);
    if (!dup) { queue.push(job); log(`queued ${job.job_id} (${job.clips.length} clips) · queue ${queue.length}`); setImmediate(pump); }
    return json(res, 202, { ok: true, queued: queue.length, duplicate: dup });
  }
  json(res, 404, { error: "not found" });
});
server.listen(PORT, "0.0.0.0", () => log(`ds-reels listening on :${PORT} · storage ${STORAGE} · out ${OUT} · bundle ${SERVE}`));
