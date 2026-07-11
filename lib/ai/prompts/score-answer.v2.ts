import { z } from "zod";

import type { AIMessage, PromptIdentity } from "@/lib/ai/types";

export const promptIdentity: PromptIdentity = { id: "score-answer", version: "v2" };

export interface ScoreAnswerV2Input {
  targetLevel: string;
  question: string;
  studentAnswer: string;
  taskType: string;
  listeningEligible: boolean;
  pronunciationEligible: boolean;
  allowedCompetencies: Array<{
    code: string;
    domain: string;
    name: string;
    performanceDescriptor: string;
    positivePatterns: string[];
    negativePatterns: string[];
    exceptions: string[];
  }>;
}

const unit = z.number().min(0).max(1);

export const scoreAnswerV2OutputSchema = z.object({
  criteria: z.object({
    accuracy: unit,
    grammar: unit,
    vocabulary: unit,
    taskCompletion: unit,
    communication: unit,
  }),
  overallScore: unit,
  confidence: unit,
  evidence: z.array(z.string()).max(8),
  strengths: z.array(z.string()).max(8),
  weaknesses: z.array(z.string()).max(8),
  observations: z
    .array(
      z.object({
        competencyCode: z.string(),
        result: z.enum(["positive", "negative", "insufficient"]),
        accuracy: unit,
        confidence: unit,
        independence: z.enum(["spontaneous", "prompted", "imitated"]),
        evidenceExcerpt: z.string(),
      }),
    )
    .max(4),
});
export type ScoreAnswerV2Output = z.infer<typeof scoreAnswerV2OutputSchema>;

function competencyLines(competencies: ScoreAnswerV2Input["allowedCompetencies"]): string {
  if (!competencies.length) return "(none)";
  return competencies
    .map(
      (competency) =>
        `- ${competency.code} [${competency.domain}] ${competency.name}: ${competency.performanceDescriptor}`,
    )
    .join("\n");
}

export function buildMessages(input: ScoreAnswerV2Input): AIMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are a strict, fair CEFR examiner scoring one spoken/written answer.",
        "All criterion scores, overall score, and confidence are decimals from 0 to 1.",
        "Evaluate real performance, not keyword presence. Do not invent errors.",
        "Propose competency observations ONLY for the allowed competencies listed below;",
        "each evidenceExcerpt must quote the student's answer.",
        "Uncertainty means result 'insufficient'. Make no mastery or CEFR final decision.",
        input.pronunciationEligible
          ? ""
          : "Never produce a pronunciation observation and never infer pronunciation from spelling.",
        input.listeningEligible ? "" : "Never produce a listening observation for a visible-text task.",
        "Respond with JSON only, matching the required schema.",
      ]
        .filter(Boolean)
        .join(" "),
    },
    {
      role: "user",
      content: [
        `Target CEFR level: ${input.targetLevel}`,
        `Task type: ${input.taskType}`,
        `Question: ${input.question}`,
        `Student answer: ${input.studentAnswer}`,
        "Allowed competencies (observations may only use these codes):",
        competencyLines(input.allowedCompetencies),
        "",
        "Return JSON with keys: criteria { accuracy, grammar, vocabulary, taskCompletion,",
        "communication }, overallScore, confidence, evidence[], strengths[], weaknesses[],",
        "observations[{ competencyCode, result, accuracy, confidence, independence, evidenceExcerpt }].",
      ].join("\n"),
    },
  ];
}
