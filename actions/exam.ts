"use server";

import { requireRole } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { getAIProvider } from "@/lib/ai/client";
import {
  promptIdentity as examQuestionV1PromptIdentity,
  buildMessages as buildExamQuestionV1Messages,
  examQuestionOutputSchema,
} from "@/lib/ai/prompts/exam-question.v1";
import {
  promptIdentity as examQuestionV2PromptIdentity,
  buildMessages as buildExamQuestionV2Messages,
  examQuestionV2OutputSchema,
} from "@/lib/ai/prompts/exam-question.v2";
import {
  promptIdentity as scoreV2PromptIdentity,
  buildMessages as buildScoreV2Messages,
  scoreAnswerV2OutputSchema,
} from "@/lib/ai/prompts/score-answer.v2";
import { submitExamAnswerSchema } from "@/lib/schemas/exam";
import { listLevels } from "@/lib/services/level";
import {
  abilityToLevel,
  calculateAbilityAfter,
  selectNextTarget,
  type CEFRCode,
  type EngineLevel,
  type ExamSkill,
} from "@/lib/exam/engine";
import {
  selectNextCompetencyProbe,
  shouldFinishCompetencyExam,
  calculateCompetencyExamFinal,
} from "@/lib/exam/competency-engine";
import { deriveStrictAchievement, deriveExamProjection } from "@/lib/competency/cefr";
import { approveObservationCandidates } from "@/lib/competency/observation";
import {
  listCompetencyDefinitions,
  listLearnerCompetencies,
  createCompetencyObservation,
  listObservationsBySession,
  type CompetencyDefinitionDTO,
} from "@/lib/services/competency";
import {
  advanceSession,
  applyExamCompetencyProjection,
  claimTurnSubmission,
  completeExam,
  createExamSession,
  createQuestionTurn,
  getActiveExamForUser,
  getCompletedExamForUser,
  getCurrentTurn,
  getExamByIdForUser,
  getTurnById,
  listScoredTurns,
  markExamTurnCompetencyFailed,
  markExamTurnCompetencySynced,
  saveScoredTurn,
  type ExamCompetencyProjectionDTO,
  type ExamSessionDTO,
  type ExamTurnDTO,
} from "@/lib/services/exam";

export interface PublicTurn {
  id: string;
  index: number;
  question: string;
}

export type ExamActionResult =
  | { status: "active"; sessionId: string; turn: PublicTurn; answered: number }
  | { status: "completed"; finalLevel: CEFRCode }
  | { status: "error"; formError?: string; fieldErrors?: Record<string, string[]>; retryable?: boolean };

function publicTurn(turn: ExamTurnDTO): PublicTurn {
  return { id: turn.id, index: turn.index, question: turn.question };
}

function domainToSkill(domain: string): ExamSkill {
  if (domain === "vocabulary") return "vocabulary";
  if (domain === "function" || domain === "communication") return "function";
  return "grammar";
}

async function loadActiveDefinitions(): Promise<CompetencyDefinitionDTO[]> {
  return listCompetencyDefinitions({ isActive: true });
}

/** Competency-aware next question; falls back to the legacy scalar target. */
async function generateNextQuestion(session: ExamSessionDTO, userId: string): Promise<ExamTurnDTO> {
  const definitions = await loadActiveDefinitions();

  if (definitions.length > 0) {
    const states = await listLearnerCompetencies(userId);
    const scored = await listScoredTurns(session.id);
    const defByCode = new Map(definitions.map((d) => [d.code, d]));
    const previousContextKeys: Record<string, string[]> = {};
    for (const turn of scored) {
      if (turn.targetCompetencyCode && turn.contextKey) {
        (previousContextKeys[turn.targetCompetencyCode] ??= []).push(turn.contextKey);
      }
    }

    const probe = selectNextCompetencyProbe({
      abilityEstimate: session.abilityEstimate,
      turnCount: session.turnCount,
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
      recentTurns: scored.map((turn) => ({
        targetCompetencyCode: turn.targetCompetencyCode,
        domain: turn.targetCompetencyCode ? defByCode.get(turn.targetCompetencyCode)?.domain : undefined,
      })),
      previousContextKeys,
    });

    if (probe) {
      const targetDef = defByCode.get(probe.targetCompetencyCode);
      const result = await getAIProvider().chatJSON(
        {
          model: env.aiGenerationModel,
          messages: buildExamQuestionV2Messages({
            targetLevel: probe.targetLevel,
            competency: {
              code: probe.targetCompetencyCode,
              domain: probe.domain,
              name: targetDef?.name ?? probe.targetCompetencyCode,
              description: targetDef?.description ?? "",
              performanceDescriptor: probe.performanceDescriptor,
            },
            relatedCompetencies: probe.relatedCompetencyCodes,
            evidenceIntent: probe.evidenceIntent,
            contextKey: probe.contextKey,
            taskType: probe.taskType,
            avoidQuestions: scored.map((t) => t.question).slice(-12),
            listeningEligible: probe.listeningEligible,
          }),
          prompt: examQuestionV2PromptIdentity,
          context: { userId, sessionId: session.id },
        },
        examQuestionV2OutputSchema,
      );

      return createQuestionTurn({
        sessionId: session.id,
        userId,
        index: session.turnCount,
        targetLevel: probe.targetLevel,
        targetedSkill: domainToSkill(probe.domain),
        targetedGoal: targetDef?.name ?? probe.targetCompetencyCode,
        goalKey: probe.targetCompetencyCode,
        question: result.data.question,
        abilityBefore: session.abilityEstimate,
        questionAiCallId: result.logId,
        targetCompetencyCode: probe.targetCompetencyCode,
        relatedCompetencyCodes: probe.relatedCompetencyCodes,
        evidenceIntent: probe.evidenceIntent,
        contextKey: probe.contextKey,
        taskType: probe.taskType,
        pronunciationEligible: probe.pronunciationEligible,
        listeningEligible: probe.listeningEligible,
      });
    }
  }

  // Legacy fallback (no competency definitions available).
  const levels = await listLevels();
  const activeLevels: EngineLevel[] = levels
    .filter((level) => level.isActive)
    .map((level) => ({ code: level.code, goals: level.goals }));
  const target = selectNextTarget({
    abilityEstimate: session.abilityEstimate,
    activeLevels,
    coveredGoalKeys: session.coveredGoalKeys,
    turnCount: session.turnCount,
  });
  const scored = await listScoredTurns(session.id);
  const result = await getAIProvider().chatJSON(
    {
      model: env.aiGenerationModel,
      messages: buildExamQuestionV1Messages({
        targetLevel: target.targetLevel,
        skill: target.targetedSkill,
        goal: target.targetedGoal,
        avoidQuestions: scored.map((t) => t.question).slice(-12),
      }),
      prompt: examQuestionV1PromptIdentity,
      context: { userId, sessionId: session.id },
    },
    examQuestionOutputSchema,
  );
  return createQuestionTurn({
    sessionId: session.id,
    userId,
    index: session.turnCount,
    targetLevel: target.targetLevel,
    targetedSkill: target.targetedSkill,
    targetedGoal: target.targetedGoal,
    goalKey: target.goalKey,
    question: result.data.question,
    abilityBefore: session.abilityEstimate,
    questionAiCallId: result.logId,
  });
}

/** Create this turn's competency observations idempotently. Throws on failure. */
async function syncTurnObservations(turn: ExamTurnDTO, session: ExamSessionDTO, userId: string): Promise<void> {
  if (turn.competencySyncStatus === "completed" || turn.competencyCandidates.length === 0) {
    if (turn.competencyCandidates.length === 0) {
      await markExamTurnCompetencySynced({ turnId: turn.id, sessionId: session.id, observationIds: [] });
    }
    return;
  }
  try {
    const ids: string[] = [];
    for (const candidate of turn.competencyCandidates) {
      const { observation } = await createCompetencyObservation({
        observationKey: `placement:${turn.id}:${candidate.competencyCode}`,
        userId,
        competencyCode: candidate.competencyCode,
        sourceType: "placement",
        sourceSessionId: session.id,
        sourceTurnId: turn.id,
        contextKey: turn.contextKey ?? "placement",
        result: candidate.result,
        accuracy: candidate.accuracy,
        confidence: candidate.confidence,
        independence: candidate.independence,
        evidenceExcerpt: candidate.evidenceExcerpt,
      });
      ids.push(observation.id);
    }
    await markExamTurnCompetencySynced({ turnId: turn.id, sessionId: session.id, observationIds: ids });
  } catch {
    await markExamTurnCompetencyFailed({ turnId: turn.id, sessionId: session.id });
    throw new Error("competency sync failed");
  }
}

async function deriveProjection(
  session: ExamSessionDTO,
  userId: string,
): Promise<{ projection: ExamCompetencyProjectionDTO; session: ExamSessionDTO }> {
  const definitions = await loadActiveDefinitions();
  const states = await listLearnerCompetencies(userId);
  const levels = await listLevels();
  const observations = await listObservationsBySession(session.id);

  const strict = deriveStrictAchievement({
    definitions: definitions.map((d) => ({
      code: d.code,
      domain: d.domain,
      level: d.level,
      isCritical: d.isCritical,
      isActive: d.isActive,
    })),
    learnerStates: states.map((s) => ({ competencyCode: s.competencyCode, status: s.status })),
    levels: levels.map((l) => ({ code: l.code, passThreshold: l.passThreshold })),
  });

  const projection = deriveExamProjection({
    definitions: definitions.map((d) => ({ code: d.code, domain: d.domain, level: d.level })),
    observations: observations.map((o) => ({
      competencyCode: o.competencyCode,
      result: o.result,
      accuracy: o.accuracy,
      confidence: o.confidence,
      independence: o.independence,
    })),
    legacyAbilityEstimate: session.abilityEstimate,
    strictAchievedLevel: strict.achievedLevel,
  });

  const projectionDTO: ExamCompetencyProjectionDTO = {
    estimatedLevel: projection.estimatedLevel,
    strictAchievedLevel: projection.strictAchievedLevel,
    confidence: projection.confidence,
    confidenceBand: projection.confidenceBand,
    usedLegacyFallback: projection.usedLegacyFallback,
    validObservationCount: projection.validObservationCount,
    distinctDomainCount: projection.distinctDomainCount,
    domainScores: projection.domainScores.map((d) => ({
      domain: d.domain,
      support: d.support,
      observationCount: d.observationCount,
    })),
  };

  const updated = await applyExamCompetencyProjection({
    sessionId: session.id,
    projection: projectionDTO,
    targetedCompetencyCodes: Array.from(new Set(observations.map((o) => o.competencyCode))),
  });
  return { projection: projectionDTO, session: updated ?? session };
}

async function finalizeAfterScore(sessionId: string, userId: string): Promise<ExamActionResult> {
  const preSession = await getExamByIdForUser(sessionId, userId);
  if (!preSession) return { status: "error", formError: "Exam not found." };

  // Resume/complete competency sync before advancing (do not advance on failure).
  const scoredTurns = await listScoredTurns(sessionId);
  for (const turn of scoredTurns) {
    if (turn.competencySyncStatus === "pending" || turn.competencySyncStatus === "failed") {
      try {
        await syncTurnObservations(turn, preSession, userId);
      } catch {
        return { status: "error", formError: "Saving your progress failed. Please retry.", retryable: true };
      }
    }
  }

  const advanced = await advanceSession({ sessionId });
  if (!advanced) return { status: "error", formError: "Exam not found." };

  const { projection, session } = await deriveProjection(advanced, userId);

  const finalScored = await listScoredTurns(sessionId);
  const candidateLevel = abilityToLevel(session.abilityEstimate);
  const candidateIndex = ["A1", "A2", "B1", "B2", "C1", "C2"].indexOf(candidateLevel);
  const probedLevels = new Set(finalScored.map((t) => t.targetLevel));
  const adjacentProbed = ["A1", "A2", "B1", "B2", "C1", "C2"].some(
    (lvl, index) => Math.abs(index - candidateIndex) === 1 && probedLevels.has(lvl as CEFRCode),
  );

  const finish = shouldFinishCompetencyExam({
    turnCount: session.turnCount,
    recentProjectionLevels: session.recentCompetencyProjectionLevels,
    recentProjectionConfidences: session.recentCompetencyProjectionConfidences,
    validObservationCount: projection.validObservationCount,
    distinctDomainCount: projection.distinctDomainCount,
    candidateProbed: probedLevels.has(candidateLevel),
    adjacentBoundaryProbed: adjacentProbed,
    recentSyncStatuses: finalScored.slice(-3).map((t) => t.competencySyncStatus),
  });

  if (finish.finished && finish.reason) {
    const final = calculateCompetencyExamFinal({
      estimatedLevel: projection.estimatedLevel,
      confidenceBand: projection.confidenceBand,
      usedLegacyFallback: projection.usedLegacyFallback,
      distinctDomainCount: projection.distinctDomainCount,
      reason: finish.reason,
    });
    await completeExam({
      sessionId,
      userId,
      finalLevel: final.finalLevel as CEFRCode,
      completionReason: final.completionReason,
      profileNeedsTeacherReview: final.profileNeedsTeacherReview,
    });
    return { status: "completed", finalLevel: final.finalLevel as CEFRCode };
  }

  try {
    const current = await getCurrentTurn(sessionId);
    const turn = current ?? (await generateNextQuestion(session, userId));
    return { status: "active", sessionId, turn: publicTurn(turn), answered: session.turnCount };
  } catch {
    return { status: "error", formError: "Could not load the next question. Please retry.", retryable: true };
  }
}

export async function startPlacementExamAction(): Promise<ExamActionResult> {
  const user = await requireRole("student");

  const completed = await getCompletedExamForUser(user.id);
  if (completed?.finalLevel) return { status: "completed", finalLevel: completed.finalLevel };

  let session = await getActiveExamForUser(user.id);
  if (session) {
    const current = await getCurrentTurn(session.id);
    if (current) {
      return { status: "active", sessionId: session.id, turn: publicTurn(current), answered: session.turnCount };
    }
  } else {
    session = await createExamSession(user.id);
  }

  try {
    const turn = await generateNextQuestion(session, user.id);
    return { status: "active", sessionId: session.id, turn: publicTurn(turn), answered: session.turnCount };
  } catch {
    return { status: "error", formError: "Could not start the exam. Please try again.", retryable: true };
  }
}

export async function submitPlacementAnswerAction(input: unknown): Promise<ExamActionResult> {
  const user = await requireRole("student");

  const parsed = submitExamAnswerSchema.safeParse(input);
  if (!parsed.success) return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  const { sessionId, turnId, submissionKey, answer } = parsed.data;

  const session = await getExamByIdForUser(sessionId, user.id);
  if (!session) return { status: "error", formError: "Exam not found." };
  if (session.status === "completed") {
    return session.finalLevel
      ? { status: "completed", finalLevel: session.finalLevel }
      : { status: "error", formError: "This exam is already complete." };
  }

  let turn = await getTurnById(turnId, sessionId);
  if (!turn || turn.userId !== user.id) return { status: "error", formError: "Question not found." };
  if (turn.status === "scored") return finalizeAfterScore(sessionId, user.id);

  const claimed = await claimTurnSubmission({ turnId, sessionId, userId: user.id, submissionKey, answer });
  let answerToScore: string;
  if (claimed) {
    answerToScore = answer;
  } else {
    turn = await getTurnById(turnId, sessionId);
    if (!turn) return { status: "error", formError: "Question not found." };
    if (turn.status === "scored") return finalizeAfterScore(sessionId, user.id);
    if (turn.submissionKey === submissionKey && turn.studentAnswer) {
      answerToScore = turn.studentAnswer;
    } else {
      return { status: "error", formError: "This answer was already submitted." };
    }
  }

  const definitions = await loadActiveDefinitions();
  const defByCode = new Map(definitions.map((d) => [d.code, d]));
  const allowedCodes = [turn.targetCompetencyCode, ...turn.relatedCompetencyCodes].filter(
    (code): code is string => Boolean(code),
  );
  const allowedCompetencies = allowedCodes
    .map((code) => defByCode.get(code))
    .filter((d): d is CompetencyDefinitionDTO => Boolean(d));

  let scoreResult;
  try {
    scoreResult = await getAIProvider().chatJSON(
      {
        model: env.aiScoringModel,
        messages: buildScoreV2Messages({
          targetLevel: turn.targetLevel,
          question: turn.question,
          studentAnswer: answerToScore,
          taskType: turn.taskType ?? "open-response",
          listeningEligible: turn.listeningEligible,
          pronunciationEligible: turn.pronunciationEligible,
          allowedCompetencies: allowedCompetencies.map((d) => ({
            code: d.code,
            domain: d.domain,
            name: d.name,
            performanceDescriptor: d.performanceDescriptor,
            positivePatterns: d.positivePatterns,
            negativePatterns: d.negativePatterns,
            exceptions: d.exceptions,
          })),
        }),
        prompt: scoreV2PromptIdentity,
        context: { userId: user.id, sessionId, turnId },
      },
      scoreAnswerV2OutputSchema,
    );
  } catch {
    return { status: "error", formError: "Scoring is temporarily unavailable. Please retry.", retryable: true };
  }

  const score = scoreResult.data;
  const approved = approveObservationCandidates({
    candidates: score.observations,
    studentMessage: answerToScore,
    allowedCompetencyCodes: allowedCodes,
    maximumIndependence: "spontaneous",
    pronunciationEligible: turn.pronunciationEligible,
    listeningEligible: turn.listeningEligible,
    competencyDomainsByCode: Object.fromEntries(definitions.map((d) => [d.code, d.domain])),
  });

  const abilityAfter = calculateAbilityAfter({
    abilityBefore: turn.abilityBefore,
    score: {
      overallScore: score.overallScore,
      criteria: {
        accuracy: score.criteria.accuracy,
        grammar: score.criteria.grammar,
        vocabulary: score.criteria.vocabulary,
        taskCompletion: score.criteria.taskCompletion,
      },
      confidence: score.confidence,
    },
  });

  await saveScoredTurn({
    turnId,
    sessionId,
    aiScore: {
      criteria: {
        accuracy: score.criteria.accuracy,
        grammar: score.criteria.grammar,
        vocabulary: score.criteria.vocabulary,
        taskCompletion: score.criteria.taskCompletion,
      },
      overallScore: score.overallScore,
      evidence: score.evidence,
      strengths: score.strengths,
      weaknesses: score.weaknesses,
      confidence: score.confidence,
    },
    confidence: score.confidence,
    needsTeacherReview: score.confidence < 0.6 || approved.length === 0,
    abilityAfter,
    projectedLevelAfter: abilityToLevel(abilityAfter),
    scoreAiCallId: scoreResult.logId,
    competencyCandidates: approved,
  });

  return finalizeAfterScore(sessionId, user.id);
}
