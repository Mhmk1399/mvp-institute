"use client";

import { useEffect, useRef, useState } from "react";

import { useClassRealtime } from "@/components/class/class-realtime-provider";
import {
  RealtimeTranscriptionClient,
  type TranscriptionStatus,
} from "@/lib/client/realtime-transcription";

type SendState = "idle" | "sending" | "failed";

export function PushToTalk({
  sessionId,
  disabled,
  onTranscript,
}: {
  sessionId: string;
  disabled: boolean;
  onTranscript(transcript: string): Promise<void>;
}) {
  const realtime = useClassRealtime();
  const clientRef = useRef<RealtimeTranscriptionClient | null>(null);
  const mountedRef = useRef(true);
  const actionPendingRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const [status, setStatus] = useState<TranscriptionStatus>("idle");
  const [partial, setPartial] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [sendState, setSendState] = useState<SendState>("idle");
  const [safeError, setSafeError] = useState<string>();

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clientRef.current?.close();
      clientRef.current = null;
    };
  }, [sessionId]);

  async function submitTranscript(transcript: string): Promise<void> {
    setSendState("sending");
    setSafeError(undefined);
    realtime.voiceTranscriptCompleted();
    try {
      await onTranscriptRef.current(transcript);
      if (!mountedRef.current) return;
      setSendState("idle");
      realtime.voiceTurnCompleted();
    } catch {
      if (!mountedRef.current) return;
      setSendState("failed");
      setSafeError("Voice message could not be sent.");
      realtime.voiceTurnFailed();
    }
  }

  function getClient(): RealtimeTranscriptionClient {
    if (clientRef.current) return clientRef.current;
    const client = new RealtimeTranscriptionClient({
      sessionId,
      onStatus: setStatus,
      onPartial: setPartial,
      onFinal: ({ transcript }) => {
        if (!mountedRef.current) return;
        setFinalTranscript(transcript);
        void submitTranscript(transcript);
      },
      onError: (message) => setSafeError(message),
    });
    clientRef.current = client;
    return client;
  }

  async function startCapture(): Promise<void> {
    if (disabled || !realtime.classReady || realtime.status !== "ready" || actionPendingRef.current) return;
    actionPendingRef.current = true;
    setFinalTranscript("");
    setSendState("idle");
    setSafeError(undefined);
    try {
      const client = getClient();
      await client.connect();
      if (!mountedRef.current) return;
      client.start();
      realtime.voiceCaptureStarted();
    } catch {
      // The client reports a safe, user-facing status and message.
    } finally {
      actionPendingRef.current = false;
    }
  }

  function stopCapture(): void {
    clientRef.current?.stop();
    realtime.voiceCaptureStopped();
  }

  function cancelCapture(): void {
    clientRef.current?.cancel();
    setPartial("");
    setFinalTranscript("");
    setSendState("idle");
    setSafeError(undefined);
    realtime.voiceCaptureCancelled();
  }

  const socketReady = realtime.status === "ready" && realtime.classReady;
  const listening = status === "listening";
  const finalizing = status === "finalizing";
  const canCancel = listening || finalizing;
  const primaryLabel = sendState === "sending"
    ? "Sending…"
    : sendState === "failed"
      ? "Try again"
      : status === "connecting"
        ? "Connecting…"
        : listening
          ? "Stop"
          : finalizing
            ? "Transcribing…"
            : status === "permission-denied"
              ? "Microphone denied"
              : status === "unsupported" || status === "error"
                ? "Voice unavailable"
                : "Enable microphone";

  const primaryDisabled = (disabled && !listening) || !socketReady || sendState === "sending" || status === "connecting" || finalizing || status === "permission-denied" || status === "unsupported";

  function handlePrimary(): void {
    if (listening) {
      stopCapture();
    } else if (sendState === "failed" && finalTranscript) {
      void submitTranscript(finalTranscript);
    } else {
      void startCapture();
    }
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
          {listening ? "Listening…" : finalizing ? "Transcribing…" : sendState === "sending" ? "Sending…" : ""}
        </span>
      </div>
      {partial ? (
        <p className="mt-3 text-sm text-[#DDF7FF]" aria-live="polite">{partial}</p>
      ) : finalTranscript ? (
        <p className="mt-3 text-sm text-[#DDF7FF]" aria-live="polite">{finalTranscript}</p>
      ) : null}
      {safeError ? <p className="mt-2 text-xs text-red-300">{safeError}</p> : null}
    </div>
  );
}
