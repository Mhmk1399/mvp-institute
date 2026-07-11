"use client";

import type { ReactNode } from "react";

import { useOptionalClassRealtime } from "@/components/class/class-realtime-provider";
import { AiOrb } from "@/components/learning/ai-orb";

export function LearningStage({
  title,
  eyebrow,
  children,
  aside,
  active,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  aside?: ReactNode;
  active?: boolean;
}) {
  const realtime = useOptionalClassRealtime();

  return (
    <main className="dashboard-bg min-h-dvh bg-[#07111F] px-4 py-6 text-[#F3F8FF] sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-7xl gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        {aside ? <aside className="order-2 lg:order-1">{aside}</aside> : null}
        <section className="order-1 flex min-w-0 flex-col rounded-[24px] border border-white/10 bg-[#0D1B2A]/78 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.22)] backdrop-blur lg:order-2">
          <div className="mb-6 flex flex-col items-center gap-4 text-center">
            <AiOrb active={active} state={realtime?.orbState} />
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#91A4B7]">{eyebrow}</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
            </div>
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}
