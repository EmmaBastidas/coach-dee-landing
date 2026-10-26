// Tipografía cinética del video de lanzamiento (launch-video/src/ui/Text.tsx), con el color de acento como prop.
import React from "react";
import { useCurrentFrame } from "remotion";
import { C, FONT_BODY, FONT_DISPLAY, FONT_MONO } from "../theme";
import { EASE_EXIT, ms, prog } from "./motion";

export type Line = { text: string; accent?: boolean };

/** Titular: cada línea sube desde una máscara (entrada decelerada), escalonada 70 ms. Sin rebote = premium. */
export const Headline: React.FC<{ lines: Line[]; start?: number; size?: number; exitAt?: number; lineStagger?: number; width?: number; accent: string; color: string }> = ({
  lines, start = 0, size = 128, exitAt, lineStagger = ms(70), width = 936, accent, color,
}) => {
  const frame = useCurrentFrame();
  const dur = ms(520);
  return (
    <div style={{ width }}>
      {lines.map((l, i) => {
        const s = start + i * lineStagger;
        const p = prog(frame, s, s + dur);
        const ex = exitAt !== undefined ? 1 - prog(frame, exitAt + i * ms(30), exitAt + ms(260), EASE_EXIT) : 1;
        return (
          <div key={i} style={{ overflow: "hidden", padding: "0.06em 0", margin: "-0.06em 0" }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: size, lineHeight: 0.94, letterSpacing: "0.005em", textTransform: "uppercase", color: l.accent ? accent : color, textShadow: "0 2px 14px rgba(0,0,0,0.45)", transform: `translateY(${(1 - p) * 105}%) translateY(${(1 - ex) * -40}%)`, opacity: Math.min(1, p * 1.5) * ex, whiteSpace: "nowrap" }}>
              {l.text}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** Etiqueta mono con el punto de señal ("● COACH DEMETRIUS SANTOS"). */
export const Eyebrow: React.FC<{ text: string; start?: number; exitAt?: number; accent: string }> = ({ text, start = 0, exitAt, accent }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, start, start + ms(420));
  const ex = exitAt !== undefined ? 1 - prog(frame, exitAt, exitAt + ms(220), EASE_EXIT) : 1;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: FONT_MONO, fontWeight: 500, fontSize: 28, letterSpacing: "0.16em", textTransform: "uppercase", color: accent, textShadow: "0 1px 8px rgba(0,0,0,0.6)", opacity: p * ex, transform: `translateX(${(1 - p) * -24}px)` }}>
      <span style={{ width: 12, height: 12, borderRadius: 999, background: accent, display: "inline-block", flex: "none" }} />
      {text}
    </div>
  );
};

/** Cuerpo en Switzer. */
export const Body: React.FC<{ text: React.ReactNode; start?: number; exitAt?: number; size?: number; color?: string; width?: number; weight?: number }> = ({ text, start = 0, exitAt, size = 38, color = C.text, width = 900, weight = 500 }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, start, start + ms(480));
  const ex = exitAt !== undefined ? 1 - prog(frame, exitAt, exitAt + ms(220), EASE_EXIT) : 1;
  return <div style={{ fontFamily: FONT_BODY, fontWeight: weight, fontSize: size, lineHeight: 1.3, color, width, opacity: p * ex, transform: `translateY(${(1 - p) * 28}px)` }}>{text}</div>;
};

/** Franja de texto (las frases que aparecen mientras corre el clip). Abre como una barra de subtítulos. */
export const Caption: React.FC<{ text: string; start?: number; end?: number; y?: number; color: string; accent: string; left?: number; maxWidth?: number }> = ({ text, start = 0, end, y = 1300, color, accent, left = 72, maxWidth = 900 }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, start, start + ms(320));
  const ex = end !== undefined ? 1 - prog(frame, end - ms(220), end, EASE_EXIT) : 1;
  const o = p * ex;
  if (o <= 0) return null;
  return (
    <div style={{ position: "absolute", left, top: y, display: "flex" }}>
      <div style={{ fontFamily: FONT_BODY, fontWeight: 600, fontSize: 46, lineHeight: 1.25, color, background: "rgba(10,10,10,0.76)", borderLeft: `8px solid ${accent}`, borderRadius: 10, padding: "20px 30px 20px 26px", textShadow: "0 1px 6px rgba(0,0,0,0.4)", opacity: o, transform: `translateY(${(1 - p) * 18}px) scale(${0.98 + 0.02 * p})`, maxWidth, boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
        {text}
      </div>
    </div>
  );
};

/** Regla de señal que entra desde la izquierda. */
export const Rule: React.FC<{ start?: number; width?: number; exitAt?: number; accent: string }> = ({ start = 0, width = 180, exitAt, accent }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, start, start + ms(600));
  const ex = exitAt !== undefined ? 1 - prog(frame, exitAt, exitAt + ms(220), EASE_EXIT) : 1;
  return <div style={{ height: 8, width: width * p, background: accent, opacity: ex }} />;
};

/** Golpe de beat: escala mínima que decae en ~9 frames. */
export const usePunch = (frame: number, at: number, amount = 0.035) => (frame < at ? 1 : 1 + amount * Math.max(0, 1 - (frame - at) / 9));
