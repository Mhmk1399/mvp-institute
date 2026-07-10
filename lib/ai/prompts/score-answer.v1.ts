import { z } from "zod";

import type { AIMessage, PromptIdentity } from "@/lib/ai/types";

export const promptIdentity: PromptIdentity = { id: "score-answer", version: "v1" };

export interface ScoreAnswerInput {
  targetLevel: string;
  question: string;
  targetedSkill: string;
  targetedGoal: string;
  studentAnswer: string;
}

const unitScore = z.number().min(0).max(1);

export const scoreAnswerOutputSchema = z.object({
  criteria: z.object({
    accuracy: unitScore,
    grammar: unitScore,
    vocabulary: unitScore,
    taskCompletion: unitScore,
  }),
  overallScore: unitScore,
  evidence: z.array(z.string()),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  confidence: unitScore,
});
export type ScoreAnswerOutput = z.infer<typeof scoreAnswerOutputSchema>;

export function buildMessages(input: ScoreAnswerInput): AIMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are a strict, fair CEFR examiner scoring one student answer.",
        "All criterion scores, the overall score, and confidence are decimals from 0 to 1.",
        "Every evidence item must be grounded in — and quote or reference — the student answer.",
        "Do not update the student's ability and do not decide a next level.",
        "Respond with JSON only, matching the required schema.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Target CEFR level: ${input.targetLevel}`,
        `Question: ${input.question}`,
        `Targeted skill: ${input.targetedSkill}`,
        `Targeted goal: ${input.targetedGoal}`,
        `Student answer: ${input.studentAnswer}`,
        "",
        "Return JSON with keys: criteria { accuracy, grammar, vocabulary, taskCompletion },",
        "overallScore, evidence[], strengths[], weaknesses[], confidence.",
      ].join("\n"),
    },
  ];
}
