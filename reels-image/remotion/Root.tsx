import React from "react";
import { Composition } from "remotion";
import { Reel, type ReelProps } from "./Reel";
import "./theme";

// Props de muestra para el Studio; el servidor manda las reales (planTimeline en pipeline.mjs).
const SAMPLE: ReelProps = {
  fps: 30, totalFrames: 300,
  segments: [{ src: "", from: 0, dur: 300 }],
  hook: { eyebrow: "Coach Demetrius Santos", lines: [{ text: "Most athletes" }, { text: "don't need" }, { text: "more workouts." }, { text: "They need a plan.", accent: true }], from: 0, dur: 150 },
  beats: [{ text: "Assess first. Then plan, coach, adjust.", from: 150, dur: 75 }],
  end: { from: 225, dur: 75, cta: "Apply for coaching · link in bio", url: "coachdsantos.com", name: "Demetrius Santos", sub: "Individualized performance coaching" },
  accent: "#F5C518", textColor: "#FAFAF8", music: null, cornerLogo: true,
};

export const RemotionRoot: React.FC = () => (
  <Composition id="Reel" component={Reel} durationInFrames={300} fps={30} width={1080} height={1920} defaultProps={SAMPLE}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(30, props.totalFrames), fps: props.fps || 30 })} />
);
