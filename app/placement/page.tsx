import Link from "next/link";

import { requireRole } from "@/lib/auth/guards";
import {
  getActiveExamForUser,
  getCompletedExamForUser,
  getCurrentTurn,
} from "@/lib/services/exam";
import { ExamRunner } from "@/components/exam/exam-runner";
import { LearningStage } from "@/components/learning/learning-stage";
import { SessionSidebar } from "@/components/learning/session-sidebar";
import type { PublicTurn } from "@/actions/exam";

export default async function PlacementPage() {
  const user = await requireRole("student");

  const completed = await getCompletedExamForUser(user.id);
  if (completed) {
    return (
      <LearningStage
        eyebrow="Placement"
        title="Placement complete"
        aside={<SessionSidebar title="Completed" meta={`Level ${completed.finalLevel ?? ""}`} />}
      >
        <p className="mb-6 text-sm text-[#91A4B7]">
          You have already completed your placement exam.
        </p>
        <Link
          href="/placement/result"
          className="rounded-2xl bg-[#57D7FF] px-5 py-2.5 text-sm font-semibold text-[#07111F] transition-opacity hover:opacity-90"
        >
          View your result
        </Link>
      </LearningStage>
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
    <LearningStage
      eyebrow="Adaptive exam"
      title="Placement exam"
      active={Boolean(initialTurn)}
      aside={
        <SessionSidebar
          title="CEFR placement"
          meta={`${active?.turnCount ?? 0} of 12 answers saved`}
        >
          <p className="text-sm leading-6 text-[#91A4B7]">
            Answer naturally in full sentences. The exam adapts after each scored turn.
          </p>
        </SessionSidebar>
      }
    >
      <ExamRunner
        initialSessionId={active?.id ?? null}
        initialTurn={initialTurn}
        initialAnswered={active?.turnCount ?? 0}
      />
    </LearningStage>
  );
}
