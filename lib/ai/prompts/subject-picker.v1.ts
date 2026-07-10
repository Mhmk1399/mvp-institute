import { z } from "zod";

import type { AIMessage, PromptIdentity } from "@/lib/ai/types";

export const promptIdentity: PromptIdentity = { id: "subject-picker", version: "v1" };

export interface SubjectPickerInput {
  level: string;
  goals: string[];
  previousSubjects: string[];
}

export const subjectPickerOutputSchema = z.object({
  subjects: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().min(1).max(1000),
        targetedGoals: z.array(z.string().min(1)).min(1).max(6),
      }),
    )
    .length(4)
    .refine(
      (subjects) => new Set(subjects.map((s) => s.title.trim().toLowerCase())).size === 4,
      { message: "The four subject titles must be distinct" },
    ),
});
export type SubjectPickerOutput = z.infer<typeof subjectPickerOutputSchema>;

function list(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "(none)";
}

export function buildMessages(input: SubjectPickerInput): AIMessage[] {
  return [
    {
      role: "system",
      content: [
        "You propose class subjects for a language learner.",
        "Return exactly four distinct subjects suitable for the given CEFR level.",
        "Every targetedGoals value must be copied verbatim from the provided",
        "curriculum goals — never invent or rephrase a goal.",
        "Avoid repeating previously used subjects.",
        "Respond with JSON only, matching the required schema.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `CEFR level: ${input.level}`,
        `Goals:\n${list(input.goals)}`,
        `Previously used subjects:\n${list(input.previousSubjects)}`,
        "",
        'Return JSON: { "subjects": [ { "title": string, "description": string, "targetedGoals": string[] } x4 ] }',
      ].join("\n"),
    },
  ];
}
