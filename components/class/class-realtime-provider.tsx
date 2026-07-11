"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { ClassSocketClient, type ClassSocketStatus } from "@/lib/client/class-socket";
import type { OrbState, ServerRealtimeEvent } from "@/lib/realtime/protocol";

export type VoiceTurnPhase = "planning" | "speaking" | "completed" | "failed";

export interface VoiceTurnView {
  turnId: string;
  studentTranscript: string;
  teacherTranscript: string;
  phase: VoiceTurnPhase;
  error?: string;
}

interface ClassRealtimeContextValue {
  status: ClassSocketStatus;
  orbState: OrbState;
  lastError?: string;
  classReady: boolean;
  voiceReady: boolean;
  voiceTurn?: VoiceTurnView;
  attachVoiceSession(callId: string, attachToken: string): void;
  voiceCaptureStarted(): void;
  voiceCaptureStopped(): void;
  voiceCaptureCancelled(): void;
}

const ClassRealtimeContext = createContext<ClassRealtimeContextValue | null>(null);

const connectionOrbState: Record<ClassSocketStatus, OrbState> = {
  connecting: "thinking",
  ready: "idle",
  reconnecting: "paused",
  offline: "paused",
  error: "error",
  closed: "paused",
};

export function ClassRealtimeProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const [status, setStatus] = useState<ClassSocketStatus>("connecting");
  const [serverOrbState, setServerOrbState] = useState<OrbState>();
  const [lastError, setLastError] = useState<string>();
  const [classReady, setClassReady] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceTurn, setVoiceTurn] = useState<VoiceTurnView>();
  const clientRef = useRef<ClassSocketClient | null>(null);

  useEffect(() => {
    function onEvent(event: ServerRealtimeEvent): void {
      switch (event.type) {
        case "orb.state":
          setServerOrbState(event.state);
          return;
        case "class.ready":
          setClassReady(true);
          return;
        case "voice.session.ready":
          setVoiceReady(true);
          return;
        case "student.transcript.final":
          setVoiceTurn({
            turnId: event.turnId,
            studentTranscript: event.transcript,
            teacherTranscript: "",
            phase: "planning",
          });
          return;
        case "teacher.reply.delta":
          setVoiceTurn((prev) =>
            prev && prev.turnId === event.turnId
              ? { ...prev, teacherTranscript: prev.teacherTranscript + event.text, phase: "speaking" }
              : prev,
          );
          return;
        case "teacher.reply.done":
          setVoiceTurn((prev) =>
            prev && prev.turnId === event.turnId
              ? { ...prev, teacherTranscript: event.text, phase: "completed" }
              : prev,
          );
          return;
        case "teacher.turn.failed":
          setVoiceTurn((prev) =>
            prev ? { ...prev, phase: "failed", error: event.message } : prev,
          );
          setLastError(event.message);
          return;
        case "error":
        case "session.replaced":
          setLastError(event.message);
          return;
        default:
          return;
      }
    }

    function onStatus(nextStatus: ClassSocketStatus): void {
      setStatus(nextStatus);
      if (nextStatus !== "ready") {
        setServerOrbState(undefined);
        setClassReady(false);
        setVoiceReady(false);
      }
    }

    const client = new ClassSocketClient({ sessionId, onEvent, onStatus });
    clientRef.current = client;
    client.connect();
    return () => {
      clientRef.current = null;
      client.close();
    };
  }, [sessionId]);

  const attachVoiceSession = useCallback((callId: string, attachToken: string) => {
    clientRef.current?.send({
      type: "voice.session.attach",
      requestId: crypto.randomUUID(),
      callId,
      attachToken,
    });
  }, []);

  const sendVoiceCapture = useCallback(
    (type: "voice.capture.started" | "voice.capture.stopped" | "voice.capture.cancelled") => {
      clientRef.current?.send({ type, requestId: crypto.randomUUID() });
    },
    [],
  );

  const voiceCaptureStarted = useCallback(() => sendVoiceCapture("voice.capture.started"), [sendVoiceCapture]);
  const voiceCaptureStopped = useCallback(() => sendVoiceCapture("voice.capture.stopped"), [sendVoiceCapture]);
  const voiceCaptureCancelled = useCallback(() => sendVoiceCapture("voice.capture.cancelled"), [sendVoiceCapture]);

  const orbState = serverOrbState ?? connectionOrbState[status];
  return (
    <ClassRealtimeContext.Provider
      value={{
        status,
        orbState,
        lastError,
        classReady,
        voiceReady,
        voiceTurn,
        attachVoiceSession,
        voiceCaptureStarted,
        voiceCaptureStopped,
        voiceCaptureCancelled,
      }}
    >
      {children}
    </ClassRealtimeContext.Provider>
  );
}

export function useClassRealtime(): ClassRealtimeContextValue {
  const value = useContext(ClassRealtimeContext);
  if (!value) throw new Error("useClassRealtime must be used within ClassRealtimeProvider");
  return value;
}

export function useOptionalClassRealtime(): ClassRealtimeContextValue | null {
  return useContext(ClassRealtimeContext);
}
