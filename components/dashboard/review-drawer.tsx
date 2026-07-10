"use client";

import type { ReviewRowDTO } from "@/lib/services/dashboard";

export function ReviewDrawer({ row, onClose }: { row: ReviewRowDTO | null; onClose: () => void }) {
  if (!row) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close review" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#0D1B2A] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#91A4B7]">{row.type} review</p>
            <h2 className="mt-1 text-xl font-semibold">{row.studentName}</h2>
            <p className="text-sm text-[#91A4B7]">{row.studentEmail}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/12 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#57D7FF]/70">
            Close
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <Block title="Prompt" text={row.detail.prompt} />
          <Block title="Student response" text={row.detail.response || "No response stored."} />
          {row.detail.aiReply ? <Block title="AI reply" text={row.detail.aiReply} /> : null}

          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="text-sm font-semibold">Review form</h3>
            <textarea
              disabled
              rows={4}
              placeholder="TeacherReview persistence is not available yet."
              className="mt-3 w-full resize-none rounded-2xl border border-white/12 bg-transparent px-3 py-2 text-sm text-[#91A4B7] outline-none"
            />
            <button type="button" disabled className="mt-3 cursor-not-allowed rounded-2xl bg-white/10 px-4 py-2 text-sm text-[#91A4B7]">
              Save review disabled
            </button>
          </section>

          <List title="Evidence" values={row.detail.evidence} />
          <List title="Strengths" values={row.detail.strengths} />
          <List title="Weaknesses" values={row.detail.weaknesses} />
          {row.detail.corrections.length ? (
            <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
              <h3 className="text-sm font-semibold">Corrections</h3>
              <div className="mt-3 space-y-3">
                {row.detail.corrections.map((correction, index) => (
                  <div key={`${correction.original}-${index}`} className="rounded-2xl border border-white/8 p-3 text-sm">
                    <p className="text-[#91A4B7]">{correction.original}</p>
                    <p className="mt-1 text-[#55E6B1]">{correction.corrected}</p>
                    <p className="mt-2 text-[#91A4B7]">{correction.explanation}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function Block({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#91A4B7]">{text}</p>
    </section>
  );
}

function List({ title, values }: { title: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-[#91A4B7]">
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </section>
  );
}
