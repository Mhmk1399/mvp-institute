"use client";

export type TranscriptionStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "finalizing"
  | "permission-denied"
  | "unsupported"
  | "error"
  | "closed";

export type FinalTranscript = {
  itemId: string;
  transcript: string;
};

interface RealtimeEvent {
  type?: unknown;
  item_id?: unknown;
  delta?: unknown;
  transcript?: unknown;
}

/**
 * Browser side of the OpenAI Realtime class call. Audio stays browser ↔ OpenAI
 * over WebRTC (mic up, teacher audio down). The SDP handshake goes through our
 * /api/realtime/class-session route, which returns the call id + attach token so
 * the app socket can bind the call. Final transcripts are shown locally only —
 * the authoritative transcript arrives from the gateway.
 */
export class RealtimeTranscriptionClient {
  private readonly sessionId: string;
  private onStatus?: (status: TranscriptionStatus) => void;
  private onPartial?: (transcript: string) => void;
  private onFinal?: (result: FinalTranscript) => void;
  private onError?: (message: string) => void;
  private onAttach?: (data: { callId: string; attachToken: string }) => void;
  private readonly endpoint: string;
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private stream?: MediaStream;
  private audioElement?: HTMLAudioElement;
  private connectPromise?: Promise<void>;
  private status: TranscriptionStatus = "idle";
  private acceptingFinal = false;
  private readonly partialByItem = new Map<string, string>();
  private readonly completedItems = new Set<string>();

  constructor(options: {
    sessionId: string;
    endpoint?: string;
    onStatus(status: TranscriptionStatus): void;
    onPartial(transcript: string): void;
    onFinal(result: FinalTranscript): void;
    onError(message: string): void;
    onAttach?(data: { callId: string; attachToken: string }): void;
  }) {
    this.sessionId = options.sessionId;
    this.endpoint = options.endpoint ?? "/api/realtime/class-session";
    this.onStatus = options.onStatus;
    this.onPartial = options.onPartial;
    this.onFinal = options.onFinal;
    this.onError = options.onError;
    this.onAttach = options.onAttach;
  }

  /**
   * Ask the model to speak the given text (browser-driven narration). Used by the
   * exam to read a question aloud; the class never calls this — its spoken reply
   * is triggered by the trusted server sideband.
   */
  speak(text: string): void {
    if (this.channel?.readyState !== "open" || !text.trim()) return;
    this.channel.send(
      JSON.stringify({
        type: "response.create",
        response: { conversation: "none", input: [], output_modalities: ["audio"], instructions: text },
      }),
    );
  }

  connect(): Promise<void> {
    if (this.status === "ready") return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.createConnection().finally(() => {
      this.connectPromise = undefined;
    });
    return this.connectPromise;
  }

  start(): void {
    if (this.status !== "ready" || this.channel?.readyState !== "open") return;
    this.partialByItem.clear();
    this.acceptingFinal = true;
    this.onPartial?.("");
    this.sendEvent({ type: "input_audio_buffer.clear" });
    this.setTracksEnabled(true);
    this.setStatus("listening");
  }

  stop(): void {
    if (this.status !== "listening") return;
    this.setTracksEnabled(false);
    this.sendEvent({ type: "input_audio_buffer.commit" });
    this.setStatus("finalizing");
  }

  cancel(): void {
    if (this.status !== "listening" && this.status !== "finalizing") return;
    this.setTracksEnabled(false);
    this.acceptingFinal = false;
    this.partialByItem.clear();
    this.sendEvent({ type: "input_audio_buffer.clear" });
    this.onPartial?.("");
    this.setStatus("ready");
  }

  close(): void {
    this.acceptingFinal = false;
    this.disposeTransport();
    this.connectPromise = undefined;
    this.partialByItem.clear();
    this.completedItems.clear();
    this.setStatus("closed");
    this.onStatus = undefined;
    this.onPartial = undefined;
    this.onFinal = undefined;
    this.onError = undefined;
    this.onAttach = undefined;
  }

  private async createConnection(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      this.setStatus("unsupported");
      throw new Error("Voice is unavailable");
    }
    this.disposeTransport();
    this.setStatus("connecting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      this.stream = stream;
      this.setTracksEnabled(false);

      const peer = new RTCPeerConnection();
      const channel = peer.createDataChannel("oai-events");
      this.peer = peer;
      this.channel = channel;
      channel.addEventListener("message", this.handleMessage);
      channel.addEventListener("close", this.handleChannelClose);
      for (const track of stream.getAudioTracks()) peer.addTrack(track, stream);

      // Remote teacher audio (hidden, autoplay).
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "");
      audio.style.display = "none";
      document.body.appendChild(audio);
      this.audioElement = audio;
      peer.addEventListener("track", (event) => {
        if (this.audioElement && event.streams[0]) this.audioElement.srcObject = event.streams[0];
      });

      const channelOpen = new Promise<void>((resolve, reject) => {
        channel.addEventListener("open", () => resolve(), { once: true });
        channel.addEventListener("error", () => reject(new Error("Data channel failed")), { once: true });
      });
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (!offer.sdp) throw new Error("Missing SDP offer");

      const response = await fetch(
        `${this.endpoint}?sessionId=${encodeURIComponent(this.sessionId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: offer.sdp,
          cache: "no-store",
        },
      );
      if (!response.ok) throw new Error("Session exchange failed");
      const callId = response.headers.get("X-Realtime-Call-Id");
      const attachToken = response.headers.get("X-Realtime-Attach-Token");
      const answer = await response.text();
      await peer.setRemoteDescription({ type: "answer", sdp: answer });
      await channelOpen;
      this.setStatus("ready");
      if (callId && attachToken) this.onAttach?.({ callId, attachToken });
    } catch (error) {
      const permissionDenied =
        error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      this.disposeTransport();
      this.setStatus(permissionDenied ? "permission-denied" : "error");
      this.onError?.(permissionDenied ? "Microphone permission was denied" : "Voice is unavailable");
      throw error;
    }
  }

  private readonly handleMessage = (message: MessageEvent<unknown>): void => {
    if (typeof message.data !== "string") return;
    let event: RealtimeEvent;
    try {
      event = JSON.parse(message.data) as RealtimeEvent;
    } catch {
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.delta") {
      if (typeof event.item_id !== "string" || typeof event.delta !== "string") return;
      const partial = `${this.partialByItem.get(event.item_id) ?? ""}${event.delta}`;
      this.partialByItem.set(event.item_id, partial);
      if (this.acceptingFinal) this.onPartial?.(partial);
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.completed") {
      if (typeof event.item_id !== "string" || this.completedItems.has(event.item_id)) return;
      this.completedItems.add(event.item_id);
      const transcript =
        typeof event.transcript === "string"
          ? event.transcript.trim()
          : (this.partialByItem.get(event.item_id) ?? "").trim();
      this.partialByItem.delete(event.item_id);
      if (!this.acceptingFinal) return;
      this.acceptingFinal = false;
      this.onPartial?.("");
      // Local display only — the gateway owns the authoritative transcript.
      if (transcript) this.onFinal?.({ itemId: event.item_id, transcript });
      this.setStatus("ready");
      return;
    }

    if (event.type === "error") this.failSafely();
  };

  private readonly handleChannelClose = (): void => {
    if (this.status !== "closed") this.failSafely();
  };

  private failSafely(): void {
    this.acceptingFinal = false;
    this.setTracksEnabled(false);
    this.disposeTransport();
    this.setStatus("error");
    this.onError?.("Voice was interrupted");
  }

  private disposeTransport(): void {
    this.setTracksEnabled(false);
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.channel?.removeEventListener("message", this.handleMessage);
    this.channel?.removeEventListener("close", this.handleChannelClose);
    this.channel?.close();
    this.peer?.close();
    if (this.audioElement) {
      this.audioElement.srcObject = null;
      this.audioElement.remove();
    }
    this.stream = undefined;
    this.channel = undefined;
    this.peer = undefined;
    this.audioElement = undefined;
  }

  private setTracksEnabled(enabled: boolean): void {
    for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = enabled;
  }

  private sendEvent(event: { type: "input_audio_buffer.clear" | "input_audio_buffer.commit" }): void {
    if (this.channel?.readyState === "open") this.channel.send(JSON.stringify(event));
  }

  private setStatus(status: TranscriptionStatus): void {
    this.status = status;
    this.onStatus?.(status);
  }
}
