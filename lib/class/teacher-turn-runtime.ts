import "server-only";

import { env } from "@/lib/env";
import { getAIProvider } from "@/lib/ai/client";
import {
  promptIdentity as plannerPromptIdentity,
  buildMessages as buildPlannerMessages,
  teacherPlannerOutputSchema,
} from "@/lib/ai/prompts/teacher-planner.v1";
import {
  promptIdentity as summaryPromptIdentity,
  buildMessages as buildSummaryMessages,
  sessionSummaryOutputSchema,
} from "@/lib/ai/prompts/session-summary.v1";
import {
  approveTeacherPlan,
  normalizeTeachingText,
  type ApprovedTeacherPlan,
} from "@/lib/class/teacher-plan";
import { listLevels } from "@/lib/services/level";
import {
  advanceClassSession,
  completeClassTurn,
  createProcessingTurn,
  failClassTurn,
  getRecentClassTurns,
  type ClassSessionDTO,
  type ClassTurnDTO,
} from "@/lib/services/class";

/**
 * Shared ML3/ML4 teacher-turn pipeline. Both /api/chat (text) and the realtime
 * gateway (voice) call prepareTeacherTurn (planner + approval) then, after the
 * reply exists, finalizeTeacherTurn (grounded persistence + session advance).
 */
const RECENT_TURNS = 8;
const MAX_TAUGHT_CONTEXT = 40;
const MAX_PENDING = 12;
const MAX_SUMMARY_CHARS = 3000;

export type InputMode = "text" | "voice";

function flattenGoals(goals: {
  grammar: string[];
  vocabulary: string[];
  functions: string[];
}): string[] {
  return [...goals.grammar, ...goals.vocabulary, ...goals.functions];
}

function compactTurns(turns: Array<{ studentMessage: string; aiMessage?: string }>): string[] {
  return turns.map((turn) => `Student: ${turn.studentMessage}\nTeacher: ${turn.aiMessage ?? ""}`);
}

function dedupe(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
    if (out.length >= max) break;
  }
  return out;
}

async function loadGoals(level: string): Promise<string[]> {
  const levels = await listLevels();
  const levelContent = levels.find((entry) => entry.code === level);
  return levelContent ? flattenGoals(levelContent.goals) : [];
}

export interface PrepareTeacherTurnInput {
  session: ClassSessionDTO;
  userId: string;
  studentMessage: string;
  submissionKey: string;
  index: number;
  inputMode: InputMode;
}

export interface PreparedTeacherTurn {
  turn: ClassTurnDTO;
  alreadyCompleted: boolean;
  approvedPlan?: ApprovedTeacherPlan;
  plannerLogId?: string;
  recentTurns: string[];
}

/** Create/reuse the processing turn, run the planner, approve deterministically. */
export async function prepareTeacherTurn(
  input: PrepareTeacherTurnInput,
): Promise<PreparedTeacherTurn> {
  const turn = await createProcessingTurn({
    sessionId: input.session.id,
    userId: input.userId,
    index: input.index,
    studentMessage: input.studentMessage,
    submissionKey: input.submissionKey,
    inputMode: input.inputMode,
  });
  if (turn.status === "completed") {
    return { turn, alreadyCompleted: true, recentTurns: [] };
  }

  const goals = await loadGoals(input.session.level);
  const recent = await getRecentClassTurns(input.session.id, RECENT_TURNS);
  const recentTurns = compactTurns(recent);

  const plannerResult = await getAIProvider().chatJSON(
    {
      model: env.aiClassPlannerModel,
      messages: buildPlannerMessages({
        level: input.session.level,
        subject: input.session.subject ?? "",
        curriculumGoals: goals,
        targetedGoals: input.session.targetedGoals,
        pendingTargets: input.session.pendingElicitedTargets.slice(0, MAX_PENDING),
        taughtItems: input.session.taughtItems
          .slice(0, MAX_TAUGHT_CONTEXT)
          .map((item) => `${item.type}: ${item.item}`),
        recentTurns,
        runningSummary: input.session.runningSummary.slice(0, MAX_SUMMARY_CHARS),
        studentMessage: input.studentMessage,
      }),
      prompt: plannerPromptIdentity,
      context: { userId: input.userId, sessionId: input.session.id, turnId: turn.id },
    },
    teacherPlannerOutputSchema,
  );

  const approvedPlan = approveTeacherPlan({
    rawPlan: plannerResult.data,
    studentMessage: input.studentMessage,
    curriculumGoals: goals,
    targetedGoals: input.session.targetedGoals,
    pendingTargets: input.session.pendingElicitedTargets,
  });

  return {
    turn,
    alreadyCompleted: false,
    approvedPlan,
    plannerLogId: plannerResult.logId,
    recentTurns,
  };
}

export interface FinalizeTeacherTurnInput {
  session: ClassSessionDTO;
  userId: string;
  submissionKey: string;
  approvedPlan: ApprovedTeacherPlan;
  studentMessage: string;
  finalReply: string;
  plannerLogId?: string;
  replyLogId?: string;
  inputMode: InputMode;
  transcription?: { provider: "openai"; model: string; transcript: string; completedAt: Date };
  realtimeResponseId?: string;
}

/** Persist only what the reply delivered, then advance the session exactly once. */
export async function finalizeTeacherTurn(input: FinalizeTeacherTurnInput): Promise<void> {
  const normalizedReply = normalizeTeachingText(input.finalReply);
  const normalizedStudent = normalizeTeachingText(input.studentMessage);

  const corrections =
    input.approvedPlan.responsePlan.correctionApproach === "none"
      ? []
      : input.approvedPlan.corrections.filter(
          (correction) =>
            normalizedStudent.includes(normalizeTeachingText(correction.original)) &&
            normalizedReply.includes(normalizeTeachingText(correction.corrected)),
        );

  const taughtInThisTurn = input.approvedPlan.taught
    .filter((item) => normalizedReply.includes(normalizeTeachingText(item.teacherLine)))
    .slice(0, 1)
    .map((item) => ({ type: item.type, item: item.item, evidence: item.teacherLine }));

  await completeClassTurn({
    sessionId: input.session.id,
    submissionKey: input.submissionKey,
    aiMessage: input.finalReply,
    corrections,
    elicitedTargets: input.approvedPlan.elicited,
    taughtInThisTurn,
    resolvedTargets: input.approvedPlan.resolvedTargets,
    teacherDecision: input.approvedPlan.decision,
    responsePlan: input.approvedPlan.responsePlan,
    plannerAiCallId: input.plannerLogId,
    replyAiCallId: input.replyLogId,
    aiCallId: input.replyLogId,
    inputMode: input.inputMode,
    transcription: input.transcription,
    realtimeResponseId: input.realtimeResponseId,
  });

  const remaining = input.session.pendingElicitedTargets.filter(
    (pendingTarget) =>
      !input.approvedPlan.resolvedTargets.some(
        (resolved) => normalizeTeachingText(resolved) === normalizeTeachingText(pendingTarget),
      ),
  );
  const pending = dedupe(
    [...remaining, ...input.approvedPlan.elicited, ...input.approvedPlan.nextTargets],
    MAX_PENDING,
  );
  const advanced = await advanceClassSession({
    sessionId: input.session.id,
    userId: input.userId,
    pendingElicitedTargets: pending,
  });

  if (advanced && advanced.turnCount > 0 && advanced.turnCount % 6 === 0) {
    try {
      const summaryTurns = await getRecentClassTurns(input.session.id, RECENT_TURNS);
      const goals = await loadGoals(input.session.level);
      const summary = await getAIProvider().chatJSON(
        {
          model: env.aiGenerationModel,
          messages: buildSummaryMessages({
            level: input.session.level,
            subject: input.session.subject ?? "",
            goals,
            recentTurns: compactTurns(summaryTurns),
            runningSummary: advanced.runningSummary,
          }),
          prompt: summaryPromptIdentity,
          context: { userId: input.userId, sessionId: input.session.id },
        },
        sessionSummaryOutputSchema,
      );
      await advanceClassSession({
        sessionId: input.session.id,
        userId: input.userId,
        pendingElicitedTargets: pending,
        runningSummary: summary.data.summary.slice(0, MAX_SUMMARY_CHARS),
      });
    } catch {
      // Keep the old running summary; the turn already succeeded.
    }
  }
}

export async function failTeacherTurn(input: {
  sessionId: string;
  submissionKey: string;
  errorCode: string;
}): Promise<void> {
  await failClassTurn({
    sessionId: input.sessionId,
    submissionKey: input.submissionKey,
    errorCode: input.errorCode,
  });
}
