import { z } from "zod";

import type { AIMessage, PromptIdentity } from "@/lib/ai/types";

export const promptIdentity: PromptIdentity = { id: "exam-question", version: "v1" };

export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface ExamQuestionInput {
  targetLevel: CEFRLevel;
  skill: string;
  goal: string;
  avoidQuestions: string[];
}

export const examQuestionOutputSchema = z.object({
  question: z.string().min(1),
  targetedSkill: z.string().min(1),
  targetedGoal: z.string().min(1),
});
export type ExamQuestionOutput = z.infer<typeof examQuestionOutputSchema>;

export function buildMessages(input: ExamQuestionInput): AIMessage[] {
  const avoid = input.avoidQuestions.length
    ? input.avoidQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
    : "(none)";

  return [
    {
      role: "system",
      content: [
        "You are a CEFR-aligned language exam item writer.",
        "Write exactly one exam question that elicits a single student response.",
        "Never reveal, hint at, or include the expected answer.",
        "Respond with JSON only, matching the required schema.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Target CEFR level: ${input.targetLevel}`,
        `Skill to target: ${input.skill}`,
        `Learning goal: ${input.goal}`,
        "Do not repeat or paraphrase any of these questions:",
        avoid,
        "",
        'Return JSON: { "question": string, "targetedSkill": string, "targetedGoal": string }',
      ].join("\n"),
    },
  ];
}
