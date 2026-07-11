"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  startPlacementExamAction,
  submitPlacementAnswerAction,
  type ExamActionResult,
  type PublicTurn,
} from "@/actions/exam";
import {
  RealtimeTranscriptionClient,
  type TranscriptionStatus,
} from "@/lib/client/realtime-transcription";

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

  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<TranscriptionStatus>("idle");
  const [partial, setPartial] = useState("");
  const [voiceError, setVoiceError] = useState<string>();
  const voiceClientRef = useRef<RealtimeTranscriptionClient | null>(null);
  const voiceStatusRef = useRef<TranscriptionStatus>("idle");
  const spokenTurnRef = useRef<string>("");

  // One submission key per displayed turn, preserved across retries of that turn.
  const submissionKey = useRef("");
  const turnId = turn?.id;
  useEffect(() => {
    if (turnId) submissionKey.current = crypto.randomUUID();
  }, [turnId]);

  useEffect(
    () => () => {
      voiceClientRef.current?.close();
      voiceClientRef.current = null;
    },
    [],
  );

  function getVoiceClient(): RealtimeTranscriptionClient {
    if (voiceClientRef.current) return voiceClientRef.current;
    const client = new RealtimeTranscriptionClient({
      sessionId: sessionId ?? "",
      endpoint: "/api/realtime/exam-session",
      onStatus: (next) => {
        voiceStatusRef.current = next;
        setVoiceStatus(next);
      },
      onPartial: setPartial,
      onFinal: ({ transcript }) => {
        setAnswer((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
      },
      onError: (message) => setVoiceError(message),
    });
    voiceClientRef.current = client;
    return client;
  }

  function speakCurrentQuestion(): void {
    const client = voiceClientRef.current;
    if (!client || !turn) return;
    const bridge =
      answered > 0
        ? 'Say a short friendly transition such as "Thanks — here is the next question." Then '
        : "";
    client.speak(
      `${bridge}Read this exam question aloud warmly and exactly, adding nothing else: "${turn.question}"`,
    );
    spokenTurnRef.current = turn.id;
  }

  // Narrate each new question once the voice session is connected.
  useEffect(() => {
    if (!voiceOn || !turn || spokenTurnRef.current === turn.id) return;
    if (voiceStatusRef.current === "ready") speakCurrentQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId, voiceOn, voiceStatus]);

  async function enableVoice(): Promise<void> {
    if (!sessionId) return;
    setVoiceOn(true);
    setVoiceError(undefined);
    try {
      const client = getVoiceClient();
      await client.connect();
      speakCurrentQuestion();
    } catch {
      setVoiceError("Voice is unavailable. You can still type your answer.");
    }
  }

  function disableVoice(): void {
    setVoiceOn(false);
    setPartial("");
    voiceClientRef.current?.close();
    voiceClientRef.current = null;
    spokenTurnRef.current = "";
  }

  function applyResult(result: ExamActionResult) {
    if (result.status === "completed") {
      disableVoice();
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
      setError("Please answer before submitting.");
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
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <p className="text-sm leading-6 text-[#91A4B7]">
          This short placement exam asks you a series of open questions and adapts to your
          answers. It takes 8–12 questions to estimate your CEFR level. Answer in full
          sentences; there is no time limit.
        </p>
        {error ? (
          <p className="rounded-2xl bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
        ) : null}
        <button
          type="button"
          onClick={handleStart}
          disabled={pending}
          className="rounded-2xl bg-[#57D7FF] px-5 py-2.5 text-sm font-semibold text-[#07111F] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Preparing…" : "Start placement exam"}
        </button>
      </div>
    );
  }

  const listening = voiceStatus === "listening";
  const finalizing = voiceStatus === "finalizing";
  const connecting = voiceStatus === "connecting";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#91A4B7]">
        {answered} / {TOTAL_TURNS} answered
      </p>

      <p className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-lg leading-relaxed text-[#F3F8FF]">
        {turn.question}
      </p>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        {!voiceOn ? (
          <button
            type="button"
            onClick={() => void enableVoice()}
            disabled={pending}
            className="rounded-xl border border-[#57D7FF]/35 px-3 py-2 text-sm font-medium text-[#DDF7FF] transition-colors hover:bg-[#57D7FF]/10 disabled:opacity-50"
          >
            🎤 Answer by voice
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending || connecting || finalizing}
              onClick={() =>
                listening ? voiceClientRef.current?.stop() : voiceClientRef.current?.start()
              }
              className="rounded-xl border border-[#57D7FF]/35 px-3 py-2 text-sm font-medium text-[#DDF7FF] transition-colors hover:bg-[#57D7FF]/10 disabled:opacity-50"
            >
              {connecting
                ? "Connecting…"
                : listening
                  ? "Stop"
                  : finalizing
                    ? "Transcribing…"
                    : "Speak your answer"}
            </button>
            <button
              type="button"
              onClick={() => speakCurrentQuestion()}
              className="rounded-xl px-3 py-2 text-sm text-[#91A4B7] hover:bg-white/5"
            >
              Repeat question
            </button>
            <button
              type="button"
              onClick={disableVoice}
              className="rounded-xl px-3 py-2 text-sm text-[#91A4B7] hover:bg-white/5"
            >
              Turn off voice
            </button>
          </div>
        )}
        {partial ? <p className="mt-3 text-sm text-[#DDF7FF]">{partial}</p> : null}
        {voiceError ? <p className="mt-2 text-xs text-red-300">{voiceError}</p> : null}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={answer}
          disabled={pending}
          rows={6}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Write your answer here… (or use voice above)"
          className="w-full rounded-3xl border border-white/12 bg-[#07111F]/45 px-4 py-3 text-sm text-[#F3F8FF] outline-none focus:border-[#57D7FF]/70 focus:ring-2 focus:ring-[#57D7FF]/15 disabled:opacity-60"
        />

        {error ? (
          <p className="rounded-2xl bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending || !answer.trim()}
          className="rounded-2xl bg-[#57D7FF] px-5 py-2.5 text-sm font-semibold text-[#07111F] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Checking…" : "Submit answer"}
        </button>
      </form>
    </div>
  );
}
