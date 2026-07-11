import { z } from "zod";

import type { AIMessage, PromptIdentity } from "@/lib/ai/types";

export const promptIdentity: PromptIdentity = { id: "exam-question", version: "v2" };

export interface ExamQuestionV2Input {
  targetLevel: string;
  competency: {
    code: string;
    domain: string;
    name: string;
    description: string;
    performanceDescriptor: string;
  };
  relatedCompetencies: string[];
  evidenceIntent: string;
  contextKey: string;
  taskType: string;
  avoidQuestions: string[];
  listeningEligible: boolean;
}

export const examQuestionV2OutputSchema = z.object({
  question: z.string().min(1).max(700),
});
export type ExamQuestionV2Output = z.infer<typeof examQuestionV2OutputSchema>;

function list(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "(none)";
}

export function buildMessages(input: ExamQuestionV2Input): AIMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are a CEFR-aligned speaking-exam item writer.",
        "Write exactly one clear response task that assesses the given performance descriptor.",
        "Match the target CEFR level and elicit enough language to judge performance.",
        "Avoid trivial yes/no answers; encourage extended speaking.",
        "Never reveal or hint at the expected answer, and never mention competency codes.",
        "Do not claim pronunciation is assessed.",
        input.listeningEligible
          ? "This may be an audio-comprehension task."
          : "This is a spoken/written response task, not a listening test.",
        "For C2, use a performance task (register shift, reformulation, explanation) — not isolated grammar naming.",
        "Keep the question under 700 characters. Respond with JSON only: { \"question\": string }.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Target CEFR level: ${input.targetLevel}`,
        `Assess this performance descriptor: ${input.competency.performanceDescriptor}`,
        `Skill area: ${input.competency.domain} — ${input.competency.name}`,
        `Evidence intent: ${input.evidenceIntent}`,
        `Context: ${input.contextKey}`,
        `Task type: ${input.taskType}`,
        "Do not repeat or paraphrase any of these questions:",
        list(input.avoidQuestions),
        "",
        'Return JSON: { "question": string }',
      ].join("\n"),
    },
  ];
}
