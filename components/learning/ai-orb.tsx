"use client";

import type { CSSProperties } from "react";

type OrbState = "idle" | "listening" | "thinking" | "speaking" | "success" | "error" | "paused";
type OrbSize = "sm" | "md" | "lg";

const bars = [
  { rotate: 0, delay: "0ms", length: "34%" },
  { rotate: 32, delay: "120ms", length: "24%" },
  { rotate: 68, delay: "260ms", length: "30%" },
  { rotate: 104, delay: "80ms", length: "22%" },
  { rotate: 142, delay: "340ms", length: "36%" },
  { rotate: 180, delay: "180ms", length: "26%" },
  { rotate: 218, delay: "420ms", length: "32%" },
  { rotate: 256, delay: "220ms", length: "23%" },
  { rotate: 292, delay: "500ms", length: "35%" },
  { rotate: 326, delay: "300ms", length: "28%" },
];

const particles = [
  { x: "16%", y: "28%", delay: "0ms" },
  { x: "78%", y: "22%", delay: "260ms" },
  { x: "72%", y: "74%", delay: "520ms" },
  { x: "24%", y: "80%", delay: "780ms" },
  { x: "50%", y: "10%", delay: "1040ms" },
];

const sizeClass: Record<OrbSize, string> = {
  sm: "ai-orb-sm",
  md: "ai-orb-md",
  lg: "ai-orb-lg",
};

export function AiOrb({
  active = false,
  state,
  size = "md",
  label,
}: {
  active?: boolean;
  state?: OrbState;
  size?: OrbSize;
  label?: string;
}) {
  const resolvedState: OrbState = state ?? (active ? "thinking" : "idle");
  const accessibleLabel = label ?? `AI assistant ${resolvedState}`;

  return (
    <div role="status" aria-label={accessibleLabel} className={`ai-orb ${sizeClass[size]} ai-orb-${resolvedState}`}>
      <span aria-hidden="true" className="ai-orb-glow" />
      <span aria-hidden="true" className="ai-orb-wave ai-orb-wave-one" />
      <span aria-hidden="true" className="ai-orb-wave ai-orb-wave-two" />
      <span aria-hidden="true" className="ai-orb-ring ai-orb-ring-one" />
      <span aria-hidden="true" className="ai-orb-ring ai-orb-ring-two" />
      <span aria-hidden="true" className="ai-orb-electric-ring" />
      <span aria-hidden="true" className="ai-orb-membrane" />
      <span aria-hidden="true" className="ai-orb-core" />
      <span aria-hidden="true" className="ai-orb-arc ai-orb-arc-one" />
      <span aria-hidden="true" className="ai-orb-arc ai-orb-arc-two" />
      <span aria-hidden="true" className="ai-orb-arc ai-orb-arc-three" />
      {bars.map((bar) => (
        <span
          aria-hidden="true"
          key={bar.rotate}
          className="ai-orb-bar"
          style={{
            "--bar-rotate": `${bar.rotate}deg`,
            "--bar-delay": bar.delay,
            "--bar-length": bar.length,
          } as CSSProperties}
        />
      ))}
      {particles.map((particle) => (
        <span
          aria-hidden="true"
          key={`${particle.x}-${particle.y}`}
          className="ai-orb-particle"
          style={{
            "--particle-x": particle.x,
            "--particle-y": particle.y,
            "--particle-delay": particle.delay,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}
