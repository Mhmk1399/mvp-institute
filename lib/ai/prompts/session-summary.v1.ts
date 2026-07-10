import { z } from "zod";

import type { AIMessage, PromptIdentity } from "@/lib/ai/types";

export const promptIdentity: PromptIdentity = { id: "session-summary", version: "v1" };

export interface SessionSummaryInput {
  level: string;
  subject: string;
  goals: string[];
  recentTurns: string[];
  runningSummary?: string;
}

const learnedItemSchema = z.object({
  type: z.enum(["vocabulary", "grammar", "function"]),
  item: z.string(),
  evidence: z.string(),
});

export const sessionSummaryOutputSchema = z.object({
  summary: z.string().min(1),
  learnedItems: z.array(learnedItemSchema),
  strengths: z.array(z.string()),
  nextSteps: z.array(z.string()),
});
export type SessionSummaryOutput = z.infer<typeof sessionSummaryOutputSchema>;

function list(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "(none)";
}

export function buildMessages(input: SessionSummaryInput): AIMessage[] {
  return [
    {
      role: "system",
      content: [
        "You summarize a completed language-learning session.",
        "Keep the summary compact enough to reuse as future context for later sessions.",
        "Only include learned items that the turns provide evidence for.",
        "Respond with JSON only, matching the required schema.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `CEFR level: ${input.level}`,
        `Subject: ${input.subject}`,
        `Goals:\n${list(input.goals)}`,
        `Previous running summary: ${input.runningSummary || "(none)"}`,
        `Session turns:\n${list(input.recentTurns)}`,
        "",
        "Return JSON with keys: summary, learnedItems[{ type, item, evidence }],",
        "strengths[], nextSteps[].",
      ].join("\n"),
    },
  ];
}
