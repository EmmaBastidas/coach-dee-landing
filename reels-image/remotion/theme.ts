// Marca "Black & Signal" (site/v2/tokens.css). Fuentes autoalojadas: el render no depende de internet.
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

export const fontsReady = Promise.all([
  loadFont({ family: "Saira Condensed", url: staticFile("fonts/SairaCondensed-800.woff2"), weight: "800" }),
  loadFont({ family: "Geist Mono", url: staticFile("fonts/GeistMono-500.woff2"), weight: "500" }),
  ...(["400", "500", "600", "700"] as const).map((weight) => loadFont({ family: "Switzer", url: staticFile(`fonts/Switzer-${weight}.woff2`), weight })),
]);

export const FONT_DISPLAY = `"Saira Condensed", "Arial Narrow", sans-serif`;
export const FONT_MONO = `"Geist Mono", ui-monospace, monospace`;
export const FONT_BODY = `Switzer, "Helvetica Neue", Arial, sans-serif`;

export const C = { bg: "#0A0A0A", text: "#EDEDEA", strong: "#FAFAF8", muted: "#9A9A96", yellow: "#F5C518", border: "rgba(255,255,255,0.12)" };

// Texto que contrasta sobre un color (botón del cierre).
export const onColor = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#0A0A0A";
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55 ? "#0A0A0A" : "#FAFAF8";
};
