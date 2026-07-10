import { z } from "zod";

import type { AIMessage, PromptIdentity } from "@/lib/ai/types";

export const promptIdentity: PromptIdentity = { id: "class-turn", version: "v1" };

export interface ClassTurnInput {
  level: string;
  subject: string;
  goals: string[];
  pendingElicitedTargets: string[];
  taughtItems: string[];
  recentTurns: string[];
  runningSummary: string;
  studentMessage: string;
}

const taughtItemSchema = z.object({
  type: z.enum(["vocabulary", "grammar", "function"]),
  item: z.string(),
  evidence: z.string(),
});

export const classTurnOutputSchema = z.object({
  reply: z.string().min(1).max(3000),
  corrections: z
    .array(
      z.object({
        original: z.string(),
        corrected: z.string(),
        explanation: z.string(),
      }),
    )
    .max(5),
  taught: z.array(taughtItemSchema).max(5),
  elicited: z.array(z.string()).max(5),
});
export type ClassTurnOutput = z.infer<typeof classTurnOutputSchema>;

function list(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "(none)";
}

export function buildMessages(input: ClassTurnInput): AIMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are a supportive one-to-one English teacher.",
        "Match the student's CEFR level and stay on the selected subject.",
        "Encourage the student to speak more than you do; keep replies concise.",
        "Do not correct every small error — correct only meaningful errors.",
        "Never shame the student. Ask at most one clear follow-up question per turn.",
        "List an item under `taught` only when your reply contains evidence of teaching it.",
        "Each correction's `original` must be grounded in the student's message.",
        "Respond with JSON only, matching the required schema.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `CEFR level: ${input.level}`,
        `Subject: ${input.subject}`,
        `Goals:\n${list(input.goals)}`,
        `Pending elicited targets:\n${list(input.pendingElicitedTargets)}`,
        `Already taught items:\n${list(input.taughtItems)}`,
        `Recent turns:\n${list(input.recentTurns)}`,
        `Running summary: ${input.runningSummary || "(none)"}`,
        `Student message: ${input.studentMessage}`,
        "",
        "Return JSON with keys: reply, corrections[{ original, corrected, explanation }],",
        "taught[{ type, item, evidence }], elicited[].",
      ].join("\n"),
    },
  ];
}
