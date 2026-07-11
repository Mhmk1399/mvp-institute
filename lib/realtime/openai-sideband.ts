import "server-only";

import { WebSocket, type RawData } from "ws";

/**
 * Server-only control channel to an existing OpenAI Realtime call. Audio flows
 * browser ↔ OpenAI over WebRTC; this sideband only observes required events and
 * triggers exactly one teacher response per class call. Raw OpenAI events are
 * never forwarded to the browser.
 */
export interface SidebandUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface SidebandCallbacks {
  onSessionCreated?(): void;
  onInputTranscriptionCompleted(data: { itemId: string; transcript: string }): void;
  onResponseCreated?(data: { responseId?: string }): void;
  onOutputTranscriptDelta(data: { text: string }): void;
  onResponseDone(data: { responseId?: string; transcript: string; usage?: SidebandUsage }): void;
  onError(data: { message: string }): void;
  onClose?(): void;
}

interface RealtimeServerEvent {
  type?: unknown;
  item_id?: unknown;
  transcript?: unknown;
  delta?: unknown;
  response?: {
    id?: unknown;
    usage?: { input_tokens?: unknown; output_tokens?: unknown; total_tokens?: unknown };
  };
  error?: { message?: unknown };
}

export class OpenAISideband {
  private socket?: WebSocket;
  private activeResponse = false;
  private transcript = "";
  private currentResponseId?: string;
  private closed = false;

  constructor(
    private readonly options: { callId: string; apiKey: string; callbacks: SidebandCallbacks },
  ) {}

  connect(): void {
    const url = `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(this.options.callId)}`;
    const socket = new WebSocket(url, {
      headers: { Authorization: `Bearer ${this.options.apiKey}` },
    });
    this.socket = socket;
    socket.on("message", (raw: RawData) => this.handleMessage(raw.toString()));
    socket.on("error", () =>
      this.options.callbacks.onError({ message: "Realtime connection error" }),
    );
    socket.on("close", () => {
      if (!this.closed) this.options.callbacks.onClose?.();
    });
  }

  private handleMessage(raw: string): void {
    let event: RealtimeServerEvent;
    try {
      event = JSON.parse(raw) as RealtimeServerEvent;
    } catch {
      return;
    }

    switch (event.type) {
      case "session.created":
        this.options.callbacks.onSessionCreated?.();
        return;
      case "conversation.item.input_audio_transcription.completed":
        if (typeof event.item_id === "string" && typeof event.transcript === "string") {
          this.options.callbacks.onInputTranscriptionCompleted({
            itemId: event.item_id,
            transcript: event.transcript.trim(),
          });
        }
        return;
      case "response.created":
        this.currentResponseId = typeof event.response?.id === "string" ? event.response.id : undefined;
        this.transcript = "";
        this.options.callbacks.onResponseCreated?.({ responseId: this.currentResponseId });
        return;
      case "response.output_audio_transcript.delta":
        if (typeof event.delta === "string") {
          this.transcript += event.delta;
          this.options.callbacks.onOutputTranscriptDelta({ text: event.delta });
        }
        return;
      case "response.output_audio_transcript.done":
        if (typeof event.transcript === "string" && event.transcript.trim()) {
          this.transcript = event.transcript;
        }
        return;
      case "response.done":
        this.activeResponse = false;
        this.options.callbacks.onResponseDone({
          responseId: this.currentResponseId,
          transcript: this.transcript.trim(),
          usage: this.readUsage(event),
        });
        return;
      case "error":
        this.activeResponse = false;
        this.options.callbacks.onError({
          message: typeof event.error?.message === "string" ? event.error.message : "Realtime error",
        });
        return;
      default:
        return;
    }
  }

  private readUsage(event: RealtimeServerEvent): SidebandUsage | undefined {
    const usage = event.response?.usage;
    if (!usage) return undefined;
    const num = (value: unknown): number | undefined =>
      typeof value === "number" ? value : undefined;
    return {
      inputTokens: num(usage.input_tokens),
      outputTokens: num(usage.output_tokens),
      totalTokens: num(usage.total_tokens),
    };
  }

  /** Trigger the single spoken teacher reply. Returns false if one is already active. */
  createTeacherResponse(params: { turnId: string; instructions: string }): boolean {
    if (this.activeResponse || this.socket?.readyState !== WebSocket.OPEN) return false;
    this.activeResponse = true;
    this.transcript = "";
    this.socket.send(
      JSON.stringify({
        type: "response.create",
        response: {
          conversation: "none",
          metadata: { kind: "class-reply", turnId: params.turnId },
          input: [],
          output_modalities: ["audio"],
          instructions: params.instructions,
        },
      }),
    );
    return true;
  }

  close(): void {
    this.closed = true;
    try {
      this.socket?.close();
    } catch {
      // ignore
    }
    this.socket = undefined;
  }
}
