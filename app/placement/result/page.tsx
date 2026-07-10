import Link from "next/link";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/guards";
import { getCompletedExamForUser } from "@/lib/services/exam";

export default async function PlacementResultPage() {
  const user = await requireRole("student");

  const completed = await getCompletedExamForUser(user.id);
  if (!completed || !completed.finalLevel) redirect("/placement");

  return (
    <main className="dashboard-bg min-h-dvh px-6 py-16 text-[#F3F8FF]">
      <div className="mx-auto w-full max-w-xl">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Your placement result</h1>
      <p className="mb-8 text-sm text-[#91A4B7]">
        Based on your answers, your estimated level is shown below.
      </p>

      <div className="rounded-3xl border border-white/10 bg-[#0D1B2A]/78 p-8 text-center">
        <p className="text-sm uppercase tracking-wide text-[#91A4B7]">CEFR level</p>
        <p className="mt-2 text-5xl font-bold tracking-tight">{completed.finalLevel}</p>
        <p className="mt-4 text-sm text-[#91A4B7]">
          Estimated from {completed.turnCount} answered{" "}
          {completed.turnCount === 1 ? "question" : "questions"}. This places you in a
          starting level; your teacher can adjust it later.
        </p>
      </div>

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
