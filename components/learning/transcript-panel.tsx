"use client";

import type { ChatMessage } from "@/components/class/class-chat";

export function TranscriptPanel({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="space-y-3">
      {messages.map((message, index) => (
        <div key={index} className={message.role === "student" ? "flex justify-end" : "flex justify-start"}>
          <p
            className={`max-w-[86%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm leading-6 ${
              message.role === "student"
                ? "bg-[#57D7FF] text-[#07111F]"
                : "border border-white/10 bg-white/[0.04] text-[#F3F8FF]"
            }`}
          >
            {message.text || "Thinking..."}
          </p>
        </div>
      ))}
    </div>
  );
}
