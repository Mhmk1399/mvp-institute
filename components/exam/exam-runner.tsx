"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  startPlacementExamAction,
  submitPlacementAnswerAction,
  type ExamActionResult,
  type PublicTurn,
} from "@/actions/exam";

const TOTAL_TURNS = 12;

export function ExamRunner({
  initialSessionId,
  initialTurn,
  initialAnswered,
}: {
  initialSessionId: string | null;
  initialTurn: PublicTurn | null;
  initialAnswered: number;
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [turn, setTurn] = useState<PublicTurn | null>(initialTurn);
  const [answered, setAnswered] = useState(initialAnswered);
  const [answer, setAnswer] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  // One submission key per displayed turn, preserved across retries of that turn.
  const submissionKey = useRef("");
  useEffect(() => {
    if (turn) submissionKey.current = crypto.randomUUID();
  }, [turn?.id]);

  function applyResult(result: ExamActionResult) {
    if (result.status === "completed") {
      router.push("/placement/result");
      return;
    }
    if (result.status === "active") {
      setSessionId(result.sessionId);
      setAnswered(result.answered);
      setTurn(result.turn);
      setAnswer("");
      setError(undefined);
      setPending(false);
      return;
    }
    setError(result.formError ?? "Something went wrong. Please try again.");
    setPending(false);
  }

  async function handleStart() {
    setPending(true);
    setError(undefined);
    applyResult(await startPlacementExamAction());
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!turn || !sessionId) return;
    const trimmed = answer.trim();
    if (!trimmed) {
      setError("Please write an answer before submitting.");
      return;
    }
    setPending(true);
    setError(undefined);
    applyResult(
      await submitPlacementAnswerAction({
        sessionId,
        turnId: turn.id,
        submissionKey: submissionKey.current,
        answer: trimmed,
      }),
    );
  }

  if (!turn) {
    return (
      <div className="space-y-5">
        <p className="text-sm text-foreground/70">
          This short placement exam asks you a series of open questions and adapts
          to your answers. It takes 8–12 questions to estimate your CEFR level.
          Answer in full sentences; there is no time limit.
        </p>
        {error ? (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={handleStart}
          disabled={pending}
          className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Preparing…" : "Start placement exam"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">
        {answered} / {TOTAL_TURNS} answered
      </p>

      <p className="text-lg leading-relaxed">{turn.question}</p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={answer}
          disabled={pending}
          rows={6}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Write your answer here…"
          className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/60 focus:ring-2 focus:ring-foreground/10 disabled:opacity-60 dark:border-white/20"
        />

        {error ? (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending || !answer.trim()}
          className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Checking…" : "Submit answer"}
        </button>
      </form>
    </div>
  );
}
