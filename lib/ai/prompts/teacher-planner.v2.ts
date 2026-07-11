import { z } from "zod";

import type { AIMessage, PromptIdentity } from "@/lib/ai/types";

export const promptIdentity: PromptIdentity = { id: "teacher-planner", version: "v2" };

export interface TeacherPlannerV2Input {
  level: string;
  subject: string;
  studentMessage: string;
  recentTurns: string[];
  runningSummary: string;
  selectedTarget: {
    competencyCode: string;
    name: string;
    domain: string;
    level: string;
    performanceDescriptor: string;
    evidenceIntent: string;
    contextKey: string;
    status: string;
    evidenceCount: number;
    evidenceRequired: number;
    distinctContextCount: number;
    contextsRequired: number;
    weightedAccuracy: number;
    confidence: number;
  };
  relatedCompetencies: string[];
}

const unit = z.number().min(0).max(1);

export const teacherPlannerV2OutputSchema = z.object({
  decision: z.object({
    move: z.enum([
      "diagnose",
      "elicit",
      "clarify",
      "recast",
      "explicit-correction",
      "teach",
      "guided-practice",
      "transfer",
      "review",
      "encourage",
    ]),
    reason: z.enum([
      "student-did-not-answer",
      "answer-too-short",
      "meaning-unclear",
      "meaning-clear-minor-error",
      "repeated-target-error",
      "student-asked-question",
      "persian-support-needed",
      "target-demonstrated",
      "context-diversity-needed",
      "independent-evidence-needed",
      "ready-for-next-target",
    ]),
    targetCompetencyCode: z.string(),
    evidenceIntent: z.enum([
      "discover",
      "positive-evidence",
      "negative-evidence",
      "context-diversity",
      "independent-use",
      "review",
    ]),
    contextKey: z.string(),
    turnObjective: z.string().min(1).max(300),
    languageMode: z.enum(["english", "english-with-brief-persian-support"]),
  }),
  responsePlan: z.object({
    acknowledgement: z.string().max(300).optional(),
    correctionApproach: z.enum(["none", "recast", "explicit"]),
    teachingPoint: z.string().max(500).optional(),
    followUpQuestion: z.string().max(300).optional(),
    maximumReplySentences: z.number().int().min(2).max(5),
  }),
  observationCandidates: z
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
  corrections: z
    .array(z.object({ original: z.string(), corrected: z.string(), explanation: z.string() }))
    .max(3),
  taught: z
    .array(
      z.object({
        type: z.enum(["vocabulary", "grammar", "function"]),
        item: z.string(),
        teacherLine: z.string(),
      }),
    )
    .max(1),
  nextCompetencyCodes: z.array(z.string()).max(3),
});
export type TeacherPlannerV2Output = z.infer<typeof teacherPlannerV2OutputSchema>;

function list(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "(none)";
}

export function buildMessages(input: TeacherPlannerV2Input): AIMessage[] {
  const target = input.selectedTarget;
  return [
    {
      role: "system",
      content: [
        "You plan one turn of a one-to-one English class. The server already chose the",
        "teaching target — you must echo its targetCompetencyCode exactly and never change it.",
        "You decide HOW to teach it (the move) and propose grounded evidence. Return JSON only.",
        "",
        "Rules: the student should speak more than the teacher; at most one main teaching point",
        "and one follow-up question. Diagnose an unobserved competency before teaching it.",
        "Transfer a developing competency into a new context. Review mastered skills only",
        "occasionally. Correct important or repeated errors; minor isolated errors may be ignored",
        "or recast. Never decide mastery or CEFR level.",
        "",
        "Observation candidates may only use the selected or related competency codes, and every",
        "evidenceExcerpt must be quoted from the student's message. Uncertainty is 'insufficient'.",
        "",
        "Persian policy: default English; use 'english-with-brief-persian-support' only to unblock",
        "the student, with at most 1–2 short Persian sentences, always giving the English form and",
        "immediately returning to English and asking the student to reuse it.",
        "",
        "Limits: observationCandidates <= 4, corrections <= 3, taught <= 1. JSON only.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `CEFR level: ${input.level}`,
        `Subject: ${input.subject}`,
        `Selected target competency (echo this code): ${target.competencyCode}`,
        `Target: ${target.name} [${target.domain} · ${target.level}] — ${target.performanceDescriptor}`,
        `Server evidence intent: ${target.evidenceIntent} · context: ${target.contextKey}`,
        `Progress: status=${target.status}, evidence ${target.evidenceCount}/${target.evidenceRequired}, contexts ${target.distinctContextCount}/${target.contextsRequired}, accuracy ${target.weightedAccuracy}, confidence ${target.confidence}`,
        `Related competency codes (for secondary evidence only): ${input.relatedCompetencies.join(", ") || "(none)"}`,
        `Running summary: ${input.runningSummary || "(none)"}`,
        `Recent turns:\n${list(input.recentTurns)}`,
        `Student message: ${input.studentMessage}`,
        "",
        "Return JSON with keys: decision { move, reason, targetCompetencyCode, evidenceIntent,",
        "contextKey, turnObjective, languageMode }, responsePlan { acknowledgement?,",
        "correctionApproach, teachingPoint?, followUpQuestion?, maximumReplySentences },",
        "observationCandidates[], corrections[], taught[], nextCompetencyCodes[].",
      ].join("\n"),
    },
  ];
}
