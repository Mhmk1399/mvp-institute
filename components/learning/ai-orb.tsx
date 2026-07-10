"use client";

export function AiOrb({ active = false }: { active?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`relative grid size-28 place-items-center rounded-full border border-[#57D7FF]/25 bg-[#57D7FF]/10 shadow-[0_0_60px_rgba(87,215,255,0.18)] ${active ? "learning-orb-active" : ""}`}
    >
      <div className="size-20 rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(243,248,255,0.9),rgba(87,215,255,0.45)_28%,rgba(148,120,255,0.18)_58%,rgba(7,17,31,0.1))]" />
    </div>
  );
}
