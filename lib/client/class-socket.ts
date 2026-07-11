"use client";

import {
  serverRealtimeEventSchema,
  type ClientRealtimeEvent,
  type ServerRealtimeEvent,
} from "@/lib/realtime/protocol";

export type ClassSocketStatus =
  | "connecting"
  | "ready"
  | "reconnecting"
  | "offline"
  | "error"
  | "closed";

const reconnectDelays = [500, 1000, 2000, 5000] as const;
const permanentErrorCodes = new Set(["CLASS_UNAVAILABLE", "ALREADY_JOINED"]);

export class ClassSocketClient {
  private socket?: WebSocket;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempt = 0;
  private explicitlyClosed = false;
  private permanentFailure = false;
  private readonly requestId = crypto.randomUUID();
  private readonly sessionId: string;
  private readonly onEvent: (event: ServerRealtimeEvent) => void;
  private readonly onStatus: (status: ClassSocketStatus) => void;

  constructor(options: {
    sessionId: string;
    onEvent(event: ServerRealtimeEvent): void;
    onStatus(status: ClassSocketStatus): void;
  }) {
    this.sessionId = options.sessionId;
    this.onEvent = options.onEvent;
    this.onStatus = options.onStatus;
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
  }

  connect(): void {
    if (this.explicitlyClosed || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
    if (!navigator.onLine) {
      this.onStatus("offline");
      return;
    }

    this.onStatus(this.reconnectAttempt ? "reconnecting" : "connecting");
    const socket = new WebSocket(this.resolveUrl());
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.send({ type: "class.join", requestId: this.requestId, sessionId: this.sessionId });
    });
    socket.addEventListener("message", (message) => {
      if (typeof message.data !== "string") return;
      let value: unknown;
      try {
        value = JSON.parse(message.data);
      } catch {
        return;
      }
      const parsed = serverRealtimeEventSchema.safeParse(value);
      if (!parsed.success) return;
      if (parsed.data.type === "error" && !parsed.data.retryable && permanentErrorCodes.has(parsed.data.code)) {
        this.permanentFailure = true;
        this.onStatus("error");
      }
      if (parsed.data.type === "session.replaced") this.permanentFailure = true;
      if (parsed.data.type === "class.ready") {
        this.reconnectAttempt = 0;
        this.onStatus("ready");
      }
      this.onEvent(parsed.data);
    });
    socket.addEventListener("error", () => this.onStatus("error"));
    socket.addEventListener("close", (event) => {
      if (this.socket === socket) this.socket = undefined;
      if (this.explicitlyClosed) {
        this.onStatus("closed");
        return;
      }
      if (this.permanentFailure || event.code === 4001 || event.code === 4403) {
        this.onStatus("error");
        return;
      }
      this.scheduleReconnect();
    });
  }

  close(): void {
    this.explicitlyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
    this.socket?.close(1000, "Client closed");
    this.socket = undefined;
    this.onStatus("closed");
  }

  send(event: ClientRealtimeEvent): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(event));
  }

  private resolveUrl(): string {
    const configured = process.env.NEXT_PUBLIC_REALTIME_WS_URL;
    if (configured) return configured;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws/class`;
  }

  private scheduleReconnect(): void {
    if (!navigator.onLine) {
      this.onStatus("offline");
      return;
    }
    this.onStatus("reconnecting");
    const delay = reconnectDelays[Math.min(this.reconnectAttempt, reconnectDelays.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }

  private readonly handleOnline = (): void => {
    if (this.explicitlyClosed || this.permanentFailure) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.connect();
  };

  private readonly handleOffline = (): void => {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.onStatus("offline");
  };
}
