import Link from "next/link";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/guards";
import { getCompletedExamForUser } from "@/lib/services/exam";

export default async function PlacementResultPage() {
  const user = await requireRole("student");

  const completed = await getCompletedExamForUser(user.id);
  if (!completed || !completed.finalLevel) redirect("/placement");

  const projection = completed.competencyProjection;
  const level = projection?.estimatedLevel ?? completed.finalLevel;
  const band = projection?.confidenceBand ?? "medium";
  const observedDomains = projection?.distinctDomainCount ?? 0;
  const domainScores = projection?.domainScores ?? [];

  return (
    <main className="dashboard-bg min-h-dvh px-6 py-16 text-[#F3F8FF]">
      <div className="mx-auto w-full max-w-xl">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Your placement result</h1>
      <p className="mb-8 text-sm text-[#91A4B7]">
        Based on your answers, your estimated level is shown below.
      </p>

      <div className="rounded-3xl border border-white/10 bg-[#0D1B2A]/78 p-8 text-center">
        <p className="text-sm uppercase tracking-wide text-[#91A4B7]">Estimated CEFR level</p>
        <p className="mt-2 text-5xl font-bold tracking-tight">{level}</p>
        <p className="mt-3 text-xs uppercase tracking-wide text-[#91A4B7]">
          Confidence: {band} · {observedDomains} skill {observedDomains === 1 ? "area" : "areas"} observed
        </p>
        <p className="mt-4 text-sm text-[#91A4B7]">
          Estimated from {completed.turnCount} answered{" "}
          {completed.turnCount === 1 ? "question" : "questions"}. Your learner profile keeps
          updating as you take classes.
        </p>
        {band === "low" ? (
          <p className="mt-3 text-sm text-amber-300/90">
            Your current level is provisional and will become more precise as more evidence is
            collected.
          </p>
        ) : null}
      </div>

      {domainScores.length ? (
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {domainScores.map((entry) => (
            <div
              key={entry.domain}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"
            >
              <span className="capitalize text-[#DDF7FF]">{entry.domain}</span>
              <span className="text-[#91A4B7]">
                {entry.support >= 0.6 ? "Strong" : entry.support >= 0.4 ? "Emerging" : "Developing"}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-8 flex justify-center">
        <Link
          href="/class"
          className="rounded-2xl bg-[#57D7FF] px-5 py-2.5 text-sm font-semibold text-[#07111F] transition-opacity hover:opacity-90"
        >
          Start speaking class
        </Link>
      </div>

      <div className="mt-6 text-center">
        <Link href="/dashboard" className="text-sm text-[#91A4B7] hover:underline">
          Back to dashboard
        </Link>
      </div>
      </div>
    </main>
  );
}
