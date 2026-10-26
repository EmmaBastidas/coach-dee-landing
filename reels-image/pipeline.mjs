// DS Reels · un trabajo de principio a fin: ffprobe → línea de tiempo al beat → ffmpeg normaliza cada tramo (9:16, 30 fps,
// lavado B/N) → Remotion monta gancho + frases + cierre + música → póster → aviso a PocketBase (callback con secreto).
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { renderMedia, selectComposition } from "@remotion/renderer";

const require = createRequire(import.meta.url);
const TRACKS = require("./tracks.json");
export const FPS = 30;

export function run(cmd, args, { timeout = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    const t = setTimeout(() => { p.kill("SIGKILL"); reject(new Error(cmd + " timeout")); }, timeout);
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (code) => { clearTimeout(t); code === 0 ? resolve(out) : reject(new Error(`${cmd} exit ${code}: ${err.slice(-1200)}`)); });
  });
}

export async function probe(file) {
  const out = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,duration:format=duration", "-of", "json", file], { timeout: 60000 });
  const j = JSON.parse(out), s = (j.streams || [])[0] || {};
  const duration = Number(j.format?.duration || s.duration || 0);
  if (!duration || !s.width) throw new Error("clip unreadable: " + path.basename(file));
  return { width: s.width, height: s.height, duration };
}

/** Línea de tiempo en frames. clips = [{path, duration}], nBeats = número de frases. */
export function planTimeline({ clips, nBeats, music }) {
  const T = TRACKS[music] || TRACKS.none;
  const beat = 60 / T.bpm;
  const f = (beats) => Math.round(beats * beat * FPS);
  const hookDur = f(T.hookBeats), lineDur = f(T.lineBeats), endDur = f(T.endBeats);
  const contentFrames = hookDur + lineDur * nBeats;
  const total = contentFrames + endDur;
  // tramos: con 1 clip corre continuo; con varios, corte en cada frontera (gancho → frase 1 → frase 2…), rotando.
  const bounds = [0];
  for (let i = 0; i < nBeats; i++) bounds.push(hookDur + lineDur * i);
  bounds.push(contentFrames);
  const segments = [];
  if (clips.length === 1) {
    segments.push({ clip: 0, from: 0, dur: contentFrames });
  } else {
    for (let i = 0; i + 1 < bounds.length; i++) segments.push({ clip: i % clips.length, from: bounds[i], dur: bounds[i + 1] - bounds[i] });
  }
  // desde qué segundo del clip arranca cada tramo (un clip reutilizado continúa donde quedó; si no le queda, vuelve al inicio)
  const used = clips.map(() => 0);
  for (const s of segments) {
    const need = s.dur / FPS, d = clips[s.clip].duration;
    if (used[s.clip] + need > d && used[s.clip] > 0) used[s.clip] = 0;
    s.start = used[s.clip]; s.avail = Math.max(0.4, d - s.start); used[s.clip] += need;
  }
  const beats = Array.from({ length: nBeats }, (_, i) => ({ from: hookDur + lineDur * i, dur: lineDur }));
  return { fps: FPS, total, hook: { from: 0, dur: hookDur }, beats, end: { from: contentFrames, dur: endDur }, segments, track: T, beatSec: beat };
}

/** Normaliza un tramo: recorte, 1080×1920 cover, 30 fps, lavado; si el clip no alcanza, cámara lenta (≤ 1.6×) o congela el último frame. */
export async function normalize(inFile, outFile, seg, { bw }) {
  const need = seg.dur / FPS, avail = seg.avail;
  const grade = bw ? "hue=s=0.08,eq=contrast=1.12:brightness=-0.02" : "eq=contrast=1.04";
  const vf = [];
  let inDur = Math.min(avail, need);
  if (avail < need) {
    const ratio = need / avail;
    if (ratio <= 1.6) { vf.push(`setpts=${ratio.toFixed(4)}*PTS`); inDur = avail; }
    else { inDur = avail; }
  }
  vf.push("scale=1080:1920:force_original_aspect_ratio=increase", "crop=1080:1920", `fps=${FPS}`, grade);
  if (avail < need && need / avail > 1.6) vf.push(`tpad=stop_mode=clone:stop_duration=${(need - avail).toFixed(3)}`);
  await run("ffmpeg", ["-y", "-v", "error", "-ss", seg.start.toFixed(3), "-t", (inDur + 0.25).toFixed(3), "-i", inFile, "-vf", vf.join(","), "-an", "-t", need.toFixed(3),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-threads", "2", outFile]);
}

/** Ejecuta un trabajo completo. ctx = { storage, outDir, workDir, serveUrl, baseUrl, log, concurrency } */
export async function runJob(job, ctx) {
  const t0 = Date.now();
  const work = path.join(ctx.workDir, job.job_id);
  await fs.rm(work, { recursive: true, force: true }); await fs.mkdir(work, { recursive: true });
  await fs.mkdir(ctx.outDir, { recursive: true });
  try {
    const spec = job.spec || {};
    // clips: rutas relativas al storage de PocketBase (<colección>/<registro>/<archivo>), sin salirse de ahí
    const clips = [];
    for (const c of job.clips || []) {
      const rel = String(c.path || "");
      if (!/^[A-Za-z0-9_]+\/[A-Za-z0-9_]+\/[A-Za-z0-9_.\-]+$/.test(rel)) throw new Error("bad clip path");
      const abs = path.resolve(ctx.storage, rel);
      if (!abs.startsWith(path.resolve(ctx.storage) + path.sep)) throw new Error("bad clip path");
      const info = await probe(abs);
      clips.push({ path: abs, ...info });
    }
    if (!clips.length) throw new Error("no clips");
    const beatsText = (Array.isArray(spec.beats) ? spec.beats : []).map((s) => String(s || "").trim()).filter(Boolean).slice(0, 4);
    const tl = planTimeline({ clips, nBeats: beatsText.length, music: spec.music });
    ctx.log(`plan: ${clips.length} clip(s), ${beatsText.length} line(s), ${tl.total} frames (${(tl.total / FPS).toFixed(1)} s), music ${spec.music || "none"}`);
    const bw = spec.bw !== false;
    const segments = [];
    for (let i = 0; i < tl.segments.length; i++) {
      const s = tl.segments[i], out = path.join(work, `seg${i}.mp4`);
      await normalize(clips[s.clip].path, out, s, { bw });
      segments.push({ src: `${ctx.baseUrl}/work/${job.job_id}/seg${i}.mp4`, from: s.from, dur: s.dur });
    }
    ctx.log(`normalized in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    const lines = (Array.isArray(spec.lines) ? spec.lines : []).map((l) => ({ text: String(l && l.text != null ? l.text : l || "").trim().slice(0, 40), accent: !!(l && l.accent) })).filter((l) => l.text).slice(0, 5);
    const T = tl.track;
    const inputProps = {
      fps: FPS, totalFrames: tl.total, segments,
      hook: { eyebrow: String(spec.eyebrow || "").slice(0, 60), lines: lines.length ? lines : [{ text: "Coached,", accent: false }, { text: "not programmed.", accent: true }], from: tl.hook.from, dur: tl.hook.dur },
      beats: tl.beats.map((b, i) => ({ ...b, text: beatsText[i].slice(0, 90) })),
      end: { ...tl.end, cta: String(spec.cta == null ? "Apply for coaching · link in bio" : spec.cta).slice(0, 48), url: "coachdsantos.com", name: "Demetrius Santos", sub: "Individualized performance coaching" },
      accent: /^#[0-9A-Fa-f]{6}$/.test(spec.accent || "") ? spec.accent : "#F5C518",
      textColor: /^#[0-9A-Fa-f]{6}$/.test(spec.textColor || "") ? spec.textColor : "#FAFAF8",
      music: T.file ? { src: T.file, trimBefore: Math.round(T.offset * FPS), volume: T.volume } : null,
      cornerLogo: spec.cornerLogo !== false,
    };
    const composition = await selectComposition({ serveUrl: ctx.serveUrl, id: "Reel", inputProps, logLevel: "warn" });
    const outFile = path.join(ctx.outDir, `${job.job_id}.mp4`);
    let lastPct = -1;
    await renderMedia({
      composition, serveUrl: ctx.serveUrl, codec: "h264", crf: 20, x264Preset: "fast", audioCodec: "aac", inputProps, outputLocation: outFile,
      concurrency: Math.max(1, Math.min(ctx.concurrency || 1, os.cpus().length)), timeoutInMilliseconds: 240000, // Remotion no admite más hilos que núcleos visibles (cpuLimit del servicio) logLevel: "warn", muted: !inputProps.music,
      onProgress: ({ progress }) => { const pct = Math.floor(progress * 10) * 10; if (pct !== lastPct) { lastPct = pct; ctx.log(`render ${pct}%`); } },
    });
    const posterAt = (tl.hook.from + tl.hook.dur * 0.72) / FPS;
    const poster = path.join(ctx.outDir, `${job.job_id}.jpg`);
    await run("ffmpeg", ["-y", "-v", "error", "-ss", posterAt.toFixed(2), "-i", outFile, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "3", poster]);
    const bytes = (await fs.stat(outFile)).size;
    ctx.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s · ${(bytes / 1e6).toFixed(1)} MB`);
    return { ok: true, file: path.basename(outFile), poster: path.basename(poster), duration: tl.total / FPS, bytes, seconds: Math.round((Date.now() - t0) / 1000) };
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
