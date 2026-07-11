"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { ClassSocketClient, type ClassSocketStatus } from "@/lib/client/class-socket";
import type { OrbState, ServerRealtimeEvent } from "@/lib/realtime/protocol";

interface ClassRealtimeContextValue {
  status: ClassSocketStatus;
  orbState: OrbState;
  lastError?: string;
  classReady: boolean;
  voiceCaptureStarted(): void;
  voiceCaptureStopped(): void;
  voiceCaptureCancelled(): void;
  voiceTranscriptCompleted(): void;
  voiceTurnCompleted(): void;
  voiceTurnFailed(): void;
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
  const clientRef = useRef<ClassSocketClient | null>(null);

  useEffect(() => {
    function onEvent(event: ServerRealtimeEvent): void {
      if (event.type === "orb.state") setServerOrbState(event.state);
      if (event.type === "class.ready") setClassReady(true);
      if (event.type === "error") setLastError(event.message);
      if (event.type === "session.replaced") setLastError(event.message);
    }

    function onStatus(nextStatus: ClassSocketStatus): void {
      setStatus(nextStatus);
      if (nextStatus !== "ready") setServerOrbState(undefined);
      if (nextStatus !== "ready") setClassReady(false);
    }

    const client = new ClassSocketClient({ sessionId, onEvent, onStatus });
    clientRef.current = client;
    client.connect();
    return () => {
      clientRef.current = null;
      client.close();
    };
  }, [sessionId]);

  const sendVoiceEvent = useCallback((type:
    | "voice.capture.started"
    | "voice.capture.stopped"
    | "voice.capture.cancelled"
    | "voice.transcript.completed"
    | "voice.turn.completed"
    | "voice.turn.failed"
  ) => {
    if (status !== "ready" || !classReady) return;
    clientRef.current?.send({ type, requestId: crypto.randomUUID() });
  }, [classReady, status]);

  const voiceCaptureStarted = useCallback(() => sendVoiceEvent("voice.capture.started"), [sendVoiceEvent]);
  const voiceCaptureStopped = useCallback(() => sendVoiceEvent("voice.capture.stopped"), [sendVoiceEvent]);
  const voiceCaptureCancelled = useCallback(() => sendVoiceEvent("voice.capture.cancelled"), [sendVoiceEvent]);
  const voiceTranscriptCompleted = useCallback(() => sendVoiceEvent("voice.transcript.completed"), [sendVoiceEvent]);
  const voiceTurnCompleted = useCallback(() => sendVoiceEvent("voice.turn.completed"), [sendVoiceEvent]);
  const voiceTurnFailed = useCallback(() => sendVoiceEvent("voice.turn.failed"), [sendVoiceEvent]);

  const orbState = serverOrbState ?? connectionOrbState[status];
  return (
    <ClassRealtimeContext.Provider value={{
      status,
      orbState,
      lastError,
      classReady,
      voiceCaptureStarted,
      voiceCaptureStopped,
      voiceCaptureCancelled,
      voiceTranscriptCompleted,
      voiceTurnCompleted,
      voiceTurnFailed,
    }}>
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
