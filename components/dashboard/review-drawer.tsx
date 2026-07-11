"use client";

import { useEffect, useRef, useState } from "react";

import type { ReviewRowDTO } from "@/lib/services/dashboard";

type Verdict = "" | "good" | "should-not-have-corrected" | "missed-opportunity" | "wrong-score";

export function ReviewDrawer({ row, onClose }: { row: ReviewRowDTO | null; onClose: () => void }) {
  if (!row) return null;
  return <ReviewDrawerContent key={row.id} row={row} onClose={onClose} />;
}

function ReviewDrawerContent({ row, onClose }: { row: ReviewRowDTO; onClose: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const [verdict, setVerdict] = useState<Verdict>("");
  const [feedback, setFeedback] = useState("");
  const [suggestedAlternative, setSuggestedAlternative] = useState("");

  useEffect(() => {
    titleRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [row, onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close review" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-drawer-title"
        className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#0D1B2A] p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#91A4B7]">{row.type} review</p>
            <h2
              ref={titleRef}
              id="review-drawer-title"
              tabIndex={-1}
              className="mt-1 text-xl font-semibold outline-none"
            >
              {row.studentName}
            </h2>
            <p className="text-sm text-[#91A4B7]">{row.studentEmail}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/12 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#57D7FF]/70">
            Close
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {row.type === "exam" ? (
            <>
              <Block title="Question" text={row.detail.prompt} />
              {row.detail.response ? <Block title="Student answer" text={row.detail.response} /> : null}
              <MetaGrid
                items={[
                  ["Score", percent(row.score)],
                  ["Confidence", percent(row.confidence)],
                ]}
              />
            </>
          ) : (
            <>
              <Block title="Subject" text={row.title} />
              <Block title="Student message" text={row.detail.response} />
              {row.detail.aiReply ? <Block title="AI reply" text={row.detail.aiReply} /> : null}
            </>
          )}

          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="text-sm font-semibold">Review form</h3>
            <p className="mt-2 rounded-2xl border border-[#57D7FF]/20 bg-[#57D7FF]/8 px-3 py-2 text-sm leading-6 text-[#91A4B7]">
              You can prepare the review here. Permanent saving will be connected in the next milestone.
            </p>
            <label htmlFor="review-verdict" className="mt-4 block text-sm font-medium">
              Verdict
            </label>
            <select
              id="review-verdict"
              value={verdict}
              onChange={(event) => setVerdict(event.target.value as Verdict)}
              className="mt-2 w-full rounded-2xl border border-white/12 bg-[#07111F] px-3 py-2 text-sm text-[#F3F8FF] outline-none focus:border-[#57D7FF]/70 focus:ring-2 focus:ring-[#57D7FF]/15"
            >
              <option value="">Choose verdict</option>
              <option value="good">Good</option>
              <option value="should-not-have-corrected">Should not have corrected</option>
              <option value="missed-opportunity">Missed opportunity</option>
              <option value="wrong-score">Wrong score</option>
            </select>

            <label htmlFor="teacher-feedback" className="mt-4 block text-sm font-medium">
              Teacher feedback
            </label>
            <textarea
              id="teacher-feedback"
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              rows={4}
              placeholder="Draft feedback for the learner or future reviewer."
              className="mt-2 w-full resize-none rounded-2xl border border-white/12 bg-transparent px-3 py-2 text-sm text-[#F3F8FF] outline-none focus:border-[#57D7FF]/70 focus:ring-2 focus:ring-[#57D7FF]/15"
            />

            <label htmlFor="suggested-alternative" className="mt-4 block text-sm font-medium">
              Suggested alternative
            </label>
            <textarea
              id="suggested-alternative"
              value={suggestedAlternative}
              onChange={(event) => setSuggestedAlternative(event.target.value)}
              rows={4}
              placeholder="Draft a better correction, score note, or teacher response."
              className="mt-2 w-full resize-none rounded-2xl border border-white/12 bg-transparent px-3 py-2 text-sm text-[#F3F8FF] outline-none focus:border-[#57D7FF]/70 focus:ring-2 focus:ring-[#57D7FF]/15"
            />

            <button type="button" disabled className="mt-4 cursor-not-allowed rounded-2xl bg-white/10 px-4 py-2 text-sm text-[#91A4B7]">
              Save review · available in Teacher Review milestone
            </button>
          </section>

          <List title={row.type === "class" ? "Taught-item evidence" : "Evidence"} values={row.detail.evidence} />
          {row.type === "exam" ? <List title="Strengths" values={row.detail.strengths} /> : null}
          {row.type === "exam" ? <List title="Weaknesses" values={row.detail.weaknesses} /> : null}
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

function percent(value: number | undefined): string {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "—";
}

function MetaGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
          <dt className="text-xs uppercase tracking-[0.16em] text-[#91A4B7]">{label}</dt>
          <dd className="mt-2 text-sm font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
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
