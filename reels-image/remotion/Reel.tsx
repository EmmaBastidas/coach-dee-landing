// Reel de marca (9:16): clip(s) ya normalizados por ffmpeg → gancho cinético → frases al ritmo con cortes al beat → cierre con logo.
// Todo lo que cambia entre reels llega por props (el servidor calcula la línea de tiempo en frames).
import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, FONT_BODY, FONT_DISPLAY, FONT_MONO, onColor } from "./theme";
import { Grain } from "./ui/Grain";
import { Body, Caption, Eyebrow, Headline, Rule, usePunch, type Line } from "./ui/Text";
import { EASE_EXIT, ms, prog } from "./ui/motion";

export type Segment = { src: string; from: number; dur: number };
export type ReelProps = {
  fps: number;
  totalFrames: number;
  segments: Segment[];
  hook: { eyebrow: string; lines: Line[]; from: number; dur: number };
  beats: { text: string; from: number; dur: number }[];
  end: { from: number; dur: number; cta: string; url: string; name: string; sub: string };
  accent: string;
  textColor: string;
  music: { src: string; trimBefore: number; volume: number } | null;
  cornerLogo: boolean;
};

const PAD = 72;

/** Oscurecimiento para legibilidad: fuerte durante el gancho, suave durante las frases. */
const Scrim: React.FC<{ strong: number }> = ({ strong }) => (
  <>
    <AbsoluteFill style={{ opacity: strong, background: "linear-gradient(180deg, rgba(10,10,10,0.35) 0%, rgba(10,10,10,0.1) 30%, rgba(10,10,10,0.25) 55%, rgba(10,10,10,0.92) 100%)" }} />
    <AbsoluteFill style={{ opacity: 1 - strong, background: "linear-gradient(180deg, rgba(10,10,10,0.2) 0%, rgba(10,10,10,0) 35%, rgba(10,10,10,0.1) 65%, rgba(10,10,10,0.6) 100%)" }} />
  </>
);

const EndCard: React.FC<{ dur: number; cta: string; url: string; name: string; sub: string; accent: string; color: string }> = ({ dur, cta, url, name, sub, accent, color }) => {
  const frame = useCurrentFrame();
  const a = prog(frame, 0, ms(700)), b = prog(frame, ms(350), ms(950)), c = prog(frame, ms(750), ms(1250));
  const out = 1 - prog(frame, dur - ms(500), dur, EASE_EXIT);
  return (
    <AbsoluteFill style={{ background: C.bg, opacity: out }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 38, paddingBottom: 140 }}>
        <Img src={staticFile("logo/ds-forward-mono-white.svg")} style={{ width: 290, height: 290, opacity: a, transform: `scale(${0.9 + 0.1 * a})` }} />
        <div style={{ textAlign: "center", opacity: b, transform: `translateY(${(1 - b) * 24}px)` }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 92, color: color, textTransform: "uppercase", lineHeight: 1 }}>{name}</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 28, letterSpacing: "0.16em", color: C.muted, marginTop: 16, textTransform: "uppercase" }}>{sub}</div>
        </div>
        <div style={{ height: 6, width: 200 * b, background: accent }} />
        <div style={{ textAlign: "center", opacity: c, transform: `translateY(${(1 - c) * 24}px)`, display: "grid", gap: 28, justifyItems: "center" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 112, color: accent, lineHeight: 1 }}>{url}</div>
          {cta ? <div style={{ fontFamily: FONT_BODY, fontWeight: 700, fontSize: 40, color: onColor(accent), background: accent, padding: "22px 40px", borderRadius: 12 }}>{cta}</div> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Reel: React.FC<ReelProps> = ({ segments, hook, beats, end, accent, textColor, music, cornerLogo, totalFrames }) => {
  const frame = useCurrentFrame();
  const hookEnd = hook.from + hook.dur;
  const strong = 1 - prog(frame, hookEnd - 10, hookEnd + 8);
  const fadeIn = interpolate(frame, [0, 10], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const toBlack = prog(frame, end.from - 8, end.from); // fundido a negro antes del cierre
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {segments.map((s, i) => {
        const punch = usePunch(frame, s.from, i === 0 ? 0 : 0.04);
        return (
          <Sequence key={i} from={s.from} durationInFrames={s.dur} premountFor={15} name={`clip ${i + 1}`}>
            <AbsoluteFill style={{ transform: `scale(${punch})`, overflow: "hidden", background: "#000" }}>
              <OffthreadVideo src={s.src} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
      {frame < end.from ? <Scrim strong={strong} /> : null}

      {/* gancho */}
      <div style={{ position: "absolute", left: PAD, right: PAD, top: 250 }}>
        {hook.eyebrow ? <Eyebrow text={hook.eyebrow} start={hook.from + 10} exitAt={hookEnd - 14} accent={accent} /> : null}
      </div>
      <div style={{ position: "absolute", left: PAD, right: PAD, bottom: 420, display: "flex", flexDirection: "column", gap: 28 }}>
        <Headline lines={hook.lines} start={hook.from + 14} size={132} lineStagger={ms(90)} exitAt={hookEnd - 14} accent={accent} color={textColor} />
        <Rule start={hook.from + 24} width={220} exitAt={hookEnd - 14} accent={accent} />
      </div>

      {/* frases al ritmo */}
      {beats.map((b, i) => (
        <Caption key={i} text={b.text} start={b.from + 2} end={b.from + b.dur} color={textColor} accent={accent} />
      ))}

      {/* marca de esquina mientras corre el clip */}
      {cornerLogo && frame < end.from ? (
        <Img src={staticFile("logo/ds-forward-mono-white.svg")} style={{ position: "absolute", right: PAD - 6, top: 236, width: 86, height: 86, opacity: 0.92 * (1 - toBlack) }} />
      ) : null}

      <AbsoluteFill style={{ background: "#000", opacity: Math.max(fadeIn, frame < end.from ? toBlack : 0), pointerEvents: "none" }} />

      <Sequence from={end.from} durationInFrames={end.dur} name="end card">
        <EndCard dur={end.dur} cta={end.cta} url={end.url} name={end.name} sub={end.sub} accent={accent} color={textColor} />
      </Sequence>

      <Grain opacity={0.08} />
      {music ? (
        <Audio src={staticFile(music.src)} trimBefore={music.trimBefore} volume={(f) => interpolate(f, [0, 10, totalFrames - 45, totalFrames - 2], [0, music.volume, music.volume, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
      ) : null}
    </AbsoluteFill>
  );
};
