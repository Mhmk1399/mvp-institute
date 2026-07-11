import "server-only";

import { env } from "@/lib/env";
import { getAIProvider } from "@/lib/ai/client";
import {
  promptIdentity as plannerV2PromptIdentity,
  buildMessages as buildPlannerV2Messages,
  teacherPlannerV2OutputSchema,
} from "@/lib/ai/prompts/teacher-planner.v2";
import {
  promptIdentity as summaryPromptIdentity,
  buildMessages as buildSummaryMessages,
  sessionSummaryOutputSchema,
} from "@/lib/ai/prompts/session-summary.v1";
import {
  approveTeacherPlanV2,
  normalizeTeachingText,
  type ApprovedTeacherPlanV2,
} from "@/lib/class/teacher-plan";
import { selectTeachingCompetency } from "@/lib/class/competency-target";
import {
  listCompetencyDefinitions,
  listLearnerCompetencies,
  createCompetencyObservation,
} from "@/lib/services/competency";
import {
  advanceClassSession,
  appendClassCompetencyCodes,
  completeClassTurn,
  createProcessingTurn,
  failClassTurn,
  getRecentClassTurns,
  markClassTurnCompetencyFailed,
  markClassTurnCompetencySynced,
  type ClassSessionDTO,
  type ClassTurnDTO,
} from "@/lib/services/class";

const RECENT_TURNS = 8;
const MAX_SUMMARY_CHARS = 3000;

export type InputMode = "text" | "voice";

function compactTurns(turns: Array<{ studentMessage: string; aiMessage?: string }>): string[] {
  return turns.map((turn) => `Student: ${turn.studentMessage}\nTeacher: ${turn.aiMessage ?? ""}`);
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
  approvedPlan?: ApprovedTeacherPlanV2;
  plannerLogId?: string;
  recentTurns: string[];
}

/** Create/reuse the processing turn, select the competency target, run planner v2. */
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
  if (turn.status === "completed") return { turn, alreadyCompleted: true, recentTurns: [] };

  const definitions = await listCompetencyDefinitions({ isActive: true });
  const states = await listLearnerCompetencies(input.userId);
  const recent = await getRecentClassTurns(input.session.id, RECENT_TURNS);
  const recentTurns = compactTurns(recent);
  const defByCode = new Map(definitions.map((d) => [d.code, d]));

  const target = selectTeachingCompetency({
    sessionLevel: input.session.level,
    subject: input.session.subject ?? "",
    sessionTargetedGoals: input.session.targetedGoals,
    activeDefinitions: definitions.map((d) => ({
      code: d.code,
      domain: d.domain,
      level: d.level,
      name: d.name,
      performanceDescriptor: d.performanceDescriptor,
      prerequisites: d.prerequisites,
      isCritical: d.isCritical,
      evidenceRequired: d.evidenceRequired,
      contextsRequired: d.contextsRequired,
      isActive: d.isActive,
    })),
    learnerStates: states.map((s) => ({
      competencyCode: s.competencyCode,
      status: s.status,
      evidenceCount: s.evidenceCount,
      distinctContextCount: s.distinctContextCount,
      negativeEvidenceCount: s.negativeEvidenceCount,
      weightedAccuracy: s.weightedAccuracy,
      confidence: s.confidence,
    })),
    recentObservations: [],
    recentTurns: recent.map((t) => ({
      targetCompetencyCode: t.targetCompetencyCode,
      contextKey: t.competencyContextKey,
    })),
  });

  const selectedCode = target?.targetCompetencyCode ?? "";
  const relatedCodes = target?.relatedCompetencyCodes ?? [];
  const allowedCodes = target ? [selectedCode, ...relatedCodes] : [];
  const contextKey = target?.contextKey ?? "general";
  const targetDef = selectedCode ? defByCode.get(selectedCode) : undefined;
  const snapshot = target?.competencySnapshot;

  const plannerResult = await getAIProvider().chatJSON(
    {
      model: env.aiClassPlannerModel,
      messages: buildPlannerV2Messages({
        level: input.session.level,
        subject: input.session.subject ?? "",
        studentMessage: input.studentMessage,
        recentTurns,
        runningSummary: input.session.runningSummary.slice(0, MAX_SUMMARY_CHARS),
        selectedTarget: {
          competencyCode: selectedCode,
          name: targetDef?.name ?? input.session.subject ?? "conversation",
          domain: targetDef?.domain ?? "communication",
          level: targetDef?.level ?? input.session.level,
          performanceDescriptor:
            targetDef?.performanceDescriptor ?? "hold a natural conversation on the subject",
          evidenceIntent: target?.evidenceIntent ?? "discover",
          contextKey,
          status: snapshot?.status ?? "not-demonstrated",
          evidenceCount: snapshot?.evidenceCount ?? 0,
          evidenceRequired: snapshot?.evidenceRequired ?? 5,
          distinctContextCount: snapshot?.distinctContextCount ?? 0,
          contextsRequired: snapshot?.contextsRequired ?? 2,
          weightedAccuracy: snapshot?.weightedAccuracy ?? 0,
          confidence: snapshot?.confidence ?? 0,
        },
        relatedCompetencies: relatedCodes,
      }),
      prompt: plannerV2PromptIdentity,
      context: { userId: input.userId, sessionId: input.session.id, turnId: turn.id },
    },
    teacherPlannerV2OutputSchema,
  );

  const approvedPlan = approveTeacherPlanV2({
    rawPlan: plannerResult.data,
    studentMessage: input.studentMessage,
    selectedTargetCode: selectedCode,
    contextKey,
    allowedCompetencyCodes: allowedCodes,
    competencyDomainsByCode: Object.fromEntries(definitions.map((d) => [d.code, d.domain])),
    maximumIndependence: target?.maximumIndependence ?? "prompted",
    pronunciationEligible: false,
    listeningEligible: false,
  });

  return { turn, alreadyCompleted: false, approvedPlan, plannerLogId: plannerResult.logId, recentTurns };
}

export interface FinalizeTeacherTurnInput {
  session: ClassSessionDTO;
  userId: string;
  turnId: string;
  submissionKey: string;
  approvedPlan: ApprovedTeacherPlanV2;
  studentMessage: string;
  finalReply: string;
  plannerLogId?: string;
  replyLogId?: string;
  inputMode: InputMode;
  transcription?: { provider: "openai"; model: string; transcript: string; completedAt: Date };
  realtimeResponseId?: string;
}

/** Persist delivered corrections/teaching, sync competency observations, advance. */
export async function finalizeTeacherTurn(input: FinalizeTeacherTurnInput): Promise<void> {
  const plan = input.approvedPlan;
  const normalizedReply = normalizeTeachingText(input.finalReply);
  const normalizedStudent = normalizeTeachingText(input.studentMessage);

  const corrections =
    plan.responsePlan.correctionApproach === "none"
      ? []
      : plan.corrections.filter(
          (c) =>
            normalizedStudent.includes(normalizeTeachingText(c.original)) &&
            normalizedReply.includes(normalizeTeachingText(c.corrected)),
        );

  const taughtInThisTurn = plan.taught
    .filter((t) => normalizedReply.includes(normalizeTeachingText(t.teacherLine)))
    .slice(0, 1)
    .map((t) => ({ type: t.type, item: t.item, evidence: t.teacherLine }));

  const candidates = plan.observationCandidates;
  const targetCode = plan.decision.targetCompetencyCode || undefined;

  await completeClassTurn({
    sessionId: input.session.id,
    submissionKey: input.submissionKey,
    aiMessage: input.finalReply,
    corrections,
    elicitedTargets: plan.nextCompetencyCodes,
    taughtInThisTurn,
    teacherDecision: {
      move: plan.decision.move,
      reason: plan.decision.reason,
      turnObjective: plan.decision.turnObjective,
      languageMode: plan.decision.languageMode,
      targetCompetencyCode: targetCode,
      evidenceIntent: plan.decision.evidenceIntent,
      contextKey: plan.decision.contextKey,
    },
    responsePlan: plan.responsePlan,
    plannerAiCallId: input.plannerLogId,
    replyAiCallId: input.replyLogId,
    aiCallId: input.replyLogId,
    inputMode: input.inputMode,
    transcription: input.transcription,
    realtimeResponseId: input.realtimeResponseId,
    targetCompetencyCode: targetCode,
    relatedCompetencyCodes: [],
    evidenceIntent: plan.decision.evidenceIntent,
    competencyContextKey: plan.decision.contextKey,
    competencyCandidates: candidates,
    competencySyncStatus: candidates.length ? "pending" : "not-required",
  });

  // Competency observations come only from the student message. Best-effort:
  // failure keeps the delivered reply and flags the turn for a later retry.
  if (candidates.length) {
    try {
      const ids: string[] = [];
      for (const candidate of candidates) {
        const { observation } = await createCompetencyObservation({
          observationKey: `class:${input.turnId}:${candidate.competencyCode}`,
          userId: input.userId,
          competencyCode: candidate.competencyCode,
          sourceType: "class",
          sourceSessionId: input.session.id,
          sourceTurnId: input.turnId,
          contextKey: plan.decision.contextKey || "class",
          result: candidate.result,
          accuracy: candidate.accuracy,
          confidence: candidate.confidence,
          independence: candidate.independence,
          evidenceExcerpt: candidate.evidenceExcerpt,
          aiCallId: input.plannerLogId,
        });
        ids.push(observation.id);
      }
      await markClassTurnCompetencySynced({
        sessionId: input.session.id,
        submissionKey: input.submissionKey,
        observationIds: ids,
      });
    } catch {
      await markClassTurnCompetencyFailed({
        sessionId: input.session.id,
        submissionKey: input.submissionKey,
      });
    }
  }

  const advanced = await advanceClassSession({
    sessionId: input.session.id,
    userId: input.userId,
    pendingElicitedTargets: plan.nextCompetencyCodes,
  });
  if (targetCode) {
    await appendClassCompetencyCodes({ sessionId: input.session.id, userId: input.userId, code: targetCode });
  }

  if (advanced && advanced.turnCount > 0 && advanced.turnCount % 6 === 0) {
    try {
      const summaryTurns = await getRecentClassTurns(input.session.id, RECENT_TURNS);
      const summary = await getAIProvider().chatJSON(
        {
          model: env.aiGenerationModel,
          messages: buildSummaryMessages({
            level: input.session.level,
            subject: input.session.subject ?? "",
            goals: input.session.targetedGoals,
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
        pendingElicitedTargets: plan.nextCompetencyCodes,
        runningSummary: summary.data.summary.slice(0, MAX_SUMMARY_CHARS),
      });
    } catch {
      // Keep the old running summary.
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
