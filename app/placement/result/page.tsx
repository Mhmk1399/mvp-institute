import Link from "next/link";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/guards";
import { getCompletedExamForUser } from "@/lib/services/exam";

export default async function PlacementResultPage() {
  const user = await requireRole("student");

  const completed = await getCompletedExamForUser(user.id);
  if (!completed || !completed.finalLevel) redirect("/placement");

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Your placement result</h1>
      <p className="mb-8 text-sm text-foreground/60">
        Based on your answers, your estimated level is shown below.
      </p>

      <div className="rounded-2xl border border-black/10 p-8 text-center dark:border-white/15">
        <p className="text-sm uppercase tracking-wide text-foreground/50">CEFR level</p>
        <p className="mt-2 text-5xl font-bold tracking-tight">{completed.finalLevel}</p>
        <p className="mt-4 text-sm text-foreground/60">
          Estimated from {completed.turnCount} answered{" "}
          {completed.turnCount === 1 ? "question" : "questions"}. This places you in a
          starting level; your teacher can adjust it later.
        </p>
      </div>

      <div className="mt-8 flex justify-center">
        <span
          aria-disabled="true"
          className="cursor-not-allowed rounded-lg border border-black/15 px-5 py-2.5 text-sm font-semibold text-foreground/40 dark:border-white/20"
        >
          Start speaking class — coming soon
        </span>
      </div>

      <div className="mt-6 text-center">
        <Link href="/" className="text-sm text-foreground/60 hover:underline">
          Back to home
        </Link>
      </div>
    </main>
  );
}
