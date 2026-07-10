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
  reply: z.string().min(1),
  corrections: z.array(
    z.object({
      original: z.string(),
      corrected: z.string(),
      explanation: z.string(),
    }),
  ),
  taught: z.array(taughtItemSchema),
  elicited: z.array(z.string()),
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
        "You are a supportive language teacher conducting a one-to-one class turn.",
        "Reply naturally, correct only meaningful errors, and keep the student engaged.",
        "Only list an item under `taught` when your reply itself contains evidence of teaching it.",
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
