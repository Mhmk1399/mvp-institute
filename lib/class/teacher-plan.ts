import type { TeacherPlannerOutput } from "@/lib/ai/prompts/teacher-planner.v1";

/**
 * Deterministic approval of a raw teacher plan. Pure TypeScript: no MongoDB,
 * auth, provider, environment, or side effects. The structural Zod parse is done
 * by chatJSON; this layer sanitizes semantic fields and never throws for one bad
 * field. The planner may propose state changes but only code validates them.
 */
export type ApprovedTeacherPlan = TeacherPlannerOutput;

export interface ApproveTeacherPlanInput {
  rawPlan: TeacherPlannerOutput;
  studentMessage: string;
  curriculumGoals: string[];
  targetedGoals: string[];
  pendingTargets: string[];
}

export function normalizeTeachingText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function containsPersian(value: string): boolean {
  return /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(value);
}

function dedupe(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizeTeachingText(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

export function approveTeacherPlan(input: ApproveTeacherPlanInput): ApprovedTeacherPlan {
  const { rawPlan } = input;

  // Only supplied goals/targets may be referenced; keep their canonical spelling.
  const allowed = new Map<string, string>();
  for (const goal of [...input.pendingTargets, ...input.targetedGoals, ...input.curriculumGoals]) {
    const key = normalizeTeachingText(goal);
    if (key && !allowed.has(key)) allowed.set(key, goal.trim());
  }
  const keepAllowed = (values: string[], max: number): string[] => {
    const canonical = values
      .map((value) => allowed.get(normalizeTeachingText(value)))
      .filter((value): value is string => Boolean(value));
    return dedupe(canonical, max);
  };

  const normalizedStudent = normalizeTeachingText(input.studentMessage);
  const studentHasPersian = containsPersian(input.studentMessage);

  const targetGoal = rawPlan.decision.targetGoal
    ? allowed.get(normalizeTeachingText(rawPlan.decision.targetGoal))
    : undefined;

  let languageMode = rawPlan.decision.languageMode;
  if (languageMode === "english-with-brief-persian-support" && !studentHasPersian) {
    languageMode = "english";
  }

  const corrections = rawPlan.corrections
    .filter((correction) => {
      const original = normalizeTeachingText(correction.original);
      return original.length > 0 && normalizedStudent.includes(original);
    })
    .slice(0, 3);

  let followUpQuestion = rawPlan.responsePlan.followUpQuestion?.trim();
  if (followUpQuestion) {
    const mark = followUpQuestion.indexOf("?");
    if (mark >= 0) followUpQuestion = followUpQuestion.slice(0, mark + 1).trim();
    followUpQuestion = followUpQuestion || undefined;
  }

  const maximumReplySentences = Math.min(
    5,
    Math.max(2, Math.round(rawPlan.responsePlan.maximumReplySentences)),
  );

  return {
    decision: {
      move: rawPlan.decision.move,
      reason: rawPlan.decision.reason,
      targetGoal,
      turnObjective: rawPlan.decision.turnObjective,
      languageMode,
    },
    responsePlan: {
      acknowledgement: rawPlan.responsePlan.acknowledgement,
      correctionApproach: rawPlan.responsePlan.correctionApproach,
      teachingPoint: rawPlan.responsePlan.teachingPoint,
      followUpQuestion,
      maximumReplySentences,
    },
    corrections,
    taught: rawPlan.taught.slice(0, 1),
    elicited: dedupe(rawPlan.elicited, 3),
    resolvedTargets: keepAllowed(rawPlan.resolvedTargets, 3),
    nextTargets: keepAllowed(rawPlan.nextTargets, 3),
  };
}
