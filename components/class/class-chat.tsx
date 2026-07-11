"use client";

import { useEffect, useRef, useState } from "react";

import { useClassRealtime } from "@/components/class/class-realtime-provider";
import { PushToTalk } from "@/components/class/push-to-talk";
import { TranscriptPanel } from "@/components/learning/transcript-panel";

export interface ChatMessage {
  role: "student" | "teacher";
  text: string;
}

export function ClassChat({
  sessionId,
  initialHistory,
}: {
  sessionId: string;
  initialHistory: ChatMessage[];
}) {
  const realtime = useClassRealtime();
  const [messages, setMessages] = useState<ChatMessage[]>(initialHistory);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function updateLastTeacher(text: string) {
    setMessages((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = { role: "teacher", text };
      return copy;
    });
  }

  async function submitMessage(value: string): Promise<void> {
    const text = value.trim();
    if (!text || submittingRef.current) throw new Error("Message submission unavailable");

    submittingRef.current = true;
    setSending(true);
    setError(undefined);
    setMessages((prev) => [
      ...prev,
      { role: "student", text },
      { role: "teacher", text: "" },
    ]);

    const submissionKey = crypto.randomUUID();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, message: text, submissionKey }),
      });
      if (!response.ok || !response.body) {
        throw new Error("request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let reply = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
          if (!line) continue;
          const event = JSON.parse(line) as { type: string; text?: string };
          if (event.type === "delta" && event.text) {
            reply += event.text;
            updateLastTeacher(reply);
          }
        }
      }

    } catch {
      setMessages((prev) => prev.slice(0, -2));
      setError("Message could not be sent. Please try again.");
      throw new Error("Message submission failed");
    } finally {
      submittingRef.current = false;
      setSending(false);
    }
  }

  async function sendTypedMessage(): Promise<void> {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    try {
      await submitMessage(text);
    } catch {
      setInput(text);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendTypedMessage();
    }
  }

  return (
    <div className="flex min-h-[52dvh] flex-col gap-4">
      <p className="text-right text-xs text-[#91A4B7]" role="status">
        {realtime.status === "ready" && realtime.classReady
          ? "Realtime connected"
          : realtime.status === "offline"
            ? "Offline"
            : "Reconnecting…"}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-3xl border border-white/10 bg-[#07111F]/35 p-4">
        <TranscriptPanel messages={messages} />
        <div ref={bottomRef} />
      </div>

      {error ? (
        <p className="rounded-2xl bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <PushToTalk sessionId={sessionId} disabled={sending} onTranscript={submitMessage} />

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          disabled={sending}
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message… (Enter to send, Shift+Enter for a new line)"
          className="w-full resize-none rounded-3xl border border-white/12 bg-[#07111F]/45 px-4 py-3 text-sm text-[#F3F8FF] outline-none focus:border-[#57D7FF]/70 focus:ring-2 focus:ring-[#57D7FF]/15 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void sendTypedMessage()}
          disabled={sending || !input.trim() || realtime.orbState === "listening" || realtime.orbState === "thinking"}
          className="rounded-2xl bg-[#57D7FF] px-4 py-3 text-sm font-semibold text-[#07111F] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {sending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
