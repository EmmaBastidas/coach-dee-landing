import { Easing, interpolate } from "remotion";

// Brand motion identity (motion-design skill, "Premium" archetype, 0% overshoot):
//   signature easing = MD3 emphasized-decelerate for entrances, accelerate for exits.
export const EASE_IN_OUT = Easing.bezier(0.4, 0, 0.2, 1);
export const EASE_ENTER = Easing.bezier(0.05, 0.7, 0.1, 1);
export const EASE_EXIT = Easing.bezier(0.3, 0, 1, 1);

export const ms = (m: number, fps = 30) => Math.round((m / 1000) * fps);

/** 0→1 progress between two frames with easing, clamped. */
export const prog = (frame: number, from: number, to: number, easing = EASE_ENTER) =>
  interpolate(frame, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });

/** Entrance: rises `dist` px and fades in. */
export const rise = (p: number, dist = 40) => ({ opacity: p, transform: `translateY(${(1 - p) * dist}px)` });
