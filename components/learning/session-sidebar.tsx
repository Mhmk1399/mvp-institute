"use client";

import type { ReactNode } from "react";

export function SessionSidebar({
  title,
  meta,
  children,
}: {
  title: string;
  meta: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[#0D1B2A]/78 p-5 text-[#F3F8FF] backdrop-blur">
      <p className="text-xs uppercase tracking-[0.18em] text-[#91A4B7]">Session</p>
      <h2 className="mt-2 text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-[#91A4B7]">{meta}</p>
      {children ? <div className="mt-5 space-y-3">{children}</div> : null}
    </div>
  );
}
