"use client";

import { useEffect, useRef, useState } from "react";

import { useClassRealtime } from "@/components/class/class-realtime-provider";
import {
  RealtimeTranscriptionClient,
  type TranscriptionStatus,
} from "@/lib/client/realtime-transcription";

export function PushToTalk({ sessionId, disabled }: { sessionId: string; disabled: boolean }) {
  const realtime = useClassRealtime();
  const clientRef = useRef<RealtimeTranscriptionClient | null>(null);
  const mountedRef = useRef(true);
  const actionPendingRef = useRef(false);
  const statusRef = useRef<TranscriptionStatus>("idle");
  const [status, setStatus] = useState<TranscriptionStatus>("idle");
  const [partial, setPartial] = useState("");
  const [finalLocal, setFinalLocal] = useState("");
  const [pendingStart, setPendingStart] = useState(false);
  const [safeError, setSafeError] = useState<string>();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clientRef.current?.close();
      clientRef.current = null;
    };
  }, [sessionId]);

  // Once the gateway confirms the voice session, begin capturing.
  useEffect(() => {
    if (!pendingStart || !realtime.voiceReady || statusRef.current !== "ready") return;
    setPendingStart(false);
    clientRef.current?.start();
    if (String(statusRef.current) === "listening") {
      notifyLifecycle(realtime.voiceCaptureStarted);
    } else {
      setSafeError("Microphone could not be started.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingStart, realtime.voiceReady]);

  function notifyLifecycle(notify: () => void): void {
    try {
      notify();
    } catch {
      setSafeError("Voice connection was interrupted.");
    }
  }

  function getClient(): RealtimeTranscriptionClient {
    if (clientRef.current) return clientRef.current;
    const client = new RealtimeTranscriptionClient({
      sessionId,
      onStatus: (nextStatus) => {
        statusRef.current = nextStatus;
        setStatus(nextStatus);
      },
      onPartial: setPartial,
      // Local display only — the authoritative transcript comes from the gateway.
      onFinal: ({ transcript }) => {
        if (mountedRef.current) setFinalLocal(transcript);
      },
      onAttach: ({ callId, attachToken }) => {
        realtime.attachVoiceSession(callId, attachToken);
      },
      onError: (message) => setSafeError(message),
    });
    clientRef.current = client;
    return client;
  }

  async function startCapture(): Promise<void> {
    if (disabled || !realtime.classReady || realtime.status !== "ready" || actionPendingRef.current) return;
    actionPendingRef.current = true;
    setSafeError(undefined);
    setFinalLocal("");
    try {
      const client = getClient();
      await client.connect();
      if (!mountedRef.current) return;
      if (statusRef.current !== "ready") {
        setSafeError("Voice connection is not ready yet.");
        return;
      }
      setPendingStart(true);
    } catch {
      setSafeError(
        statusRef.current === "permission-denied"
          ? "Microphone permission was denied."
          : "Voice connection could not be started.",
      );
    } finally {
      actionPendingRef.current = false;
    }
  }

  function stopCapture(): void {
    clientRef.current?.stop();
    notifyLifecycle(realtime.voiceCaptureStopped);
  }

  function cancelCapture(): void {
    clientRef.current?.cancel();
    setPendingStart(false);
    setPartial("");
    setFinalLocal("");
    setSafeError(undefined);
    notifyLifecycle(realtime.voiceCaptureCancelled);
  }

  const socketReady = realtime.status === "ready" && realtime.classReady;
  const teacherBusy =
    realtime.voiceTurn?.phase === "planning" || realtime.voiceTurn?.phase === "speaking";
  const listening = status === "listening";
  const finalizing = status === "finalizing";
  const preparing = pendingStart || status === "connecting";
  const canCancel = listening || finalizing;

  const primaryLabel = !socketReady
    ? "Connecting voice…"
    : preparing
      ? "Connecting…"
      : listening
        ? "Stop"
        : finalizing
          ? "Transcribing…"
          : teacherBusy
            ? "Teacher speaking…"
            : status === "permission-denied"
              ? "Microphone denied"
              : status === "unsupported" || status === "error"
                ? "Voice unavailable"
                : "Speak";

  const primaryDisabled =
    (disabled && !listening) ||
    !socketReady ||
    preparing ||
    finalizing ||
    (teacherBusy && !listening) ||
    status === "permission-denied" ||
    status === "unsupported";

  function handlePrimary(): void {
    if (listening) stopCapture();
    else void startCapture();
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={listening}
          disabled={primaryDisabled}
          onClick={handlePrimary}
          className="rounded-xl border border-[#57D7FF]/35 px-3 py-2 text-sm font-medium text-[#DDF7FF] outline-none transition-colors hover:bg-[#57D7FF]/10 focus-visible:ring-2 focus-visible:ring-[#57D7FF]/70 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {primaryLabel}
        </button>
        {canCancel ? (
          <button
            type="button"
            onClick={cancelCapture}
            className="rounded-xl px-3 py-2 text-sm text-[#91A4B7] outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/40"
          >
            Cancel
          </button>
        ) : null}
        <span className="text-xs text-[#91A4B7]" role="status">
          {listening ? "Listening…" : finalizing ? "Transcribing…" : teacherBusy ? "Teacher is replying…" : ""}
        </span>
      </div>
      {partial ? (
        <p className="mt-3 text-sm text-[#DDF7FF]" aria-live="polite">{partial}</p>
      ) : finalLocal ? (
        <p className="mt-3 text-sm text-[#91A4B7]" aria-live="polite">{finalLocal}</p>
      ) : null}
      {safeError || (!socketReady && realtime.lastError) ? (
        <p className="mt-2 text-xs text-red-300">{safeError ?? realtime.lastError}</p>
      ) : null}
    </div>
  );
}
