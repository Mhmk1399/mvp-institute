import { z } from "zod";

import type { AIMessage, PromptIdentity } from "@/lib/ai/types";

export const promptIdentity: PromptIdentity = { id: "teacher-planner", version: "v1" };

export interface TeacherPlannerInput {
  level: string;
  subject: string;
  curriculumGoals: string[];
  targetedGoals: string[];
  pendingTargets: string[];
  taughtItems: string[];
  recentTurns: string[];
  runningSummary: string;
  studentMessage: string;
}

const moveEnum = z.enum([
  "elicit",
  "clarify",
  "recast",
  "explicit-correction",
  "teach",
  "guided-practice",
  "review",
  "encourage",
]);

const reasonEnum = z.enum([
  "student-did-not-answer",
  "answer-too-short",
  "meaning-unclear",
  "meaning-clear-minor-error",
  "repeated-target-error",
  "student-asked-question",
  "persian-support-needed",
  "target-demonstrated",
  "ready-for-next-target",
]);

export const teacherPlannerOutputSchema = z.object({
  decision: z.object({
    move: moveEnum,
    reason: reasonEnum,
    targetGoal: z.string().max(300).optional(),
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
  corrections: z
    .array(
      z.object({
        original: z.string(),
        corrected: z.string(),
        explanation: z.string(),
      }),
    )
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
  elicited: z.array(z.string()).max(3),
  resolvedTargets: z.array(z.string()).max(3),
  nextTargets: z.array(z.string()).max(3),
});
export type TeacherPlannerOutput = z.infer<typeof teacherPlannerOutputSchema>;

function list(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "(none)";
}

export function buildMessages(input: TeacherPlannerInput): AIMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are the planning brain of a one-to-one English teacher. You do NOT write the",
        "student-facing reply; you decide the single best teaching move and return JSON only.",
        "",
        "Reason in this priority order and stop at the first that applies:",
        "1. Answer a direct student question.",
        "2. Did the student answer the previous question?",
        "3. Is the meaning understandable?",
        "4. Is the response long enough for useful speaking practice?",
        "5. Identify only important meaning or target errors.",
        "6. Detect repeated important errors.",
        "7. Detect English/Persian code-switching that needs support.",
        "8. Was the current target demonstrated?",
        "9. Prefer reviewing an older item before teaching many new items.",
        "10. Choose the single move most likely to make the student speak more.",
        "",
        "Teaching rules: the student should speak more than the teacher; at most one main",
        "teaching point and one follow-up question; do not correct every minor error; use",
        "recast for minor clear-meaning errors; use explicit correction for repeated or",
        "meaning-blocking errors; stay on the selected subject; never shame the student;",
        "never invent curriculum goals — only reference supplied goals/targets.",
        "",
        "Persian policy: default to English. Use languageMode",
        "'english-with-brief-persian-support' ONLY when the student uses Persian because an",
        "English word is unknown, asks for Persian clarification, or cannot express an idea in",
        "English. Then plan at most 1–2 short Persian sentences, always with the useful English",
        "expression, then return to English and ask the student to reuse it. Never plan a full",
        "Persian conversation.",
        "",
        "Respond with JSON only, matching the required schema.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `CEFR level: ${input.level}`,
        `Subject: ${input.subject}`,
        `Curriculum goals:\n${list(input.curriculumGoals)}`,
        `Targeted goals:\n${list(input.targetedGoals)}`,
        `Pending targets:\n${list(input.pendingTargets)}`,
        `Already taught items:\n${list(input.taughtItems)}`,
        `Recent turns:\n${list(input.recentTurns)}`,
        `Running summary: ${input.runningSummary || "(none)"}`,
        `Student message: ${input.studentMessage}`,
        "",
        "Return JSON with keys: decision { move, reason, targetGoal?, turnObjective,",
        "languageMode }, responsePlan { acknowledgement?, correctionApproach, teachingPoint?,",
        "followUpQuestion?, maximumReplySentences }, corrections[{ original, corrected,",
        "explanation }], taught[{ type, item, teacherLine }], elicited[], resolvedTargets[],",
        "nextTargets[]. targetGoal, resolvedTargets and nextTargets must be copied from the",
        "supplied goals/targets above.",
      ].join("\n"),
    },
  ];
}
