import Link from "next/link";

import { requireRole } from "@/lib/auth/guards";
import {
  getActiveExamForUser,
  getCompletedExamForUser,
  getCurrentTurn,
} from "@/lib/services/exam";
import { ExamRunner } from "@/components/exam/exam-runner";
import type { PublicTurn } from "@/actions/exam";

export default async function PlacementPage() {
  const user = await requireRole("student");

  const completed = await getCompletedExamForUser(user.id);
  if (completed) {
    return (
      <main className="mx-auto w-full max-w-xl px-6 py-16">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Placement complete</h1>
        <p className="mb-6 text-sm text-foreground/60">
          You have already completed your placement exam.
        </p>
        <Link
          href="/placement/result"
          className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
        >
          View your result
        </Link>
      </main>
    );
  }

  const active = await getActiveExamForUser(user.id);
  let initialTurn: PublicTurn | null = null;
  if (active) {
    const current = await getCurrentTurn(active.id);
    if (current) {
      initialTurn = { id: current.id, index: current.index, question: current.question };
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Placement exam</h1>
      <ExamRunner
        initialSessionId={active?.id ?? null}
        initialTurn={initialTurn}
        initialAnswered={active?.turnCount ?? 0}
      />
    </main>
  );
}
