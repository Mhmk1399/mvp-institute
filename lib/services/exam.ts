import "server-only";

import mongoose from "mongoose";

import { connectToDatabase } from "@/lib/db/mongoose";
import { User } from "@/lib/models/user";
import { ExamSession, type ExamSessionDoc } from "@/lib/models/exam-session";
import { ExamTurn, type ExamTurnDoc } from "@/lib/models/exam-turn";
import type { CEFRCode, ExamSkill } from "@/lib/exam/engine";
import type { EvidenceIntent, TaskType } from "@/lib/exam/competency-engine";

type SessionLean = ExamSessionDoc & { createdAt: Date; updatedAt: Date };
type TurnLean = ExamTurnDoc & { createdAt: Date; updatedAt: Date };

export interface ExamCompetencyProjectionDTO {
  estimatedLevel: CEFRCode;
  strictAchievedLevel?: CEFRCode;
  confidence: number;
  confidenceBand: "low" | "medium" | "high";
  usedLegacyFallback: boolean;
  validObservationCount: number;
  distinctDomainCount: number;
  domainScores: Array<{ domain: string; support: number; observationCount: number }>;
}

export interface ExamCompetencyCandidateDTO {
  competencyCode: string;
  result: "positive" | "negative" | "insufficient";
  accuracy: number;
  confidence: number;
  independence: "spontaneous" | "prompted" | "imitated";
  evidenceExcerpt: string;
}

export interface ExamSessionDTO {
  id: string;
  userId: string;
  status: "active" | "completed" | "abandoned";
  abilityEstimate: number;
  turnCount: number;
  recentProjectedLevels: CEFRCode[];
  coveredGoalKeys: string[];
  finalLevel?: CEFRCode;
  completedAt?: string;
  targetedCompetencyCodes: string[];
  recentCompetencyProjectionLevels: CEFRCode[];
  recentCompetencyProjectionConfidences: number[];
  profileNeedsTeacherReview: boolean;
  completionReason?: "converged" | "hard-stop" | "legacy-fallback";
  competencyProjection?: ExamCompetencyProjectionDTO;
  createdAt: string;
  updatedAt: string;
}

export interface ExamScoreDTO {
  criteria: {
    accuracy: number;
    grammar: number;
    vocabulary: number;
    taskCompletion: number;
  };
  overallScore: number;
  evidence: string[];
  strengths: string[];
  weaknesses: string[];
  confidence: number;
}

export interface ExamTurnDTO {
  id: string;
  sessionId: string;
  userId: string;
  index: number;
  status: "awaiting-answer" | "scored";
  targetLevel: CEFRCode;
  targetedSkill: ExamSkill;
  targetedGoal: string;
  goalKey: string;
  question: string;
  studentAnswer?: string;
  aiScore?: ExamScoreDTO;
  confidence?: number;
  needsTeacherReview: boolean;
  abilityBefore: number;
  abilityAfter?: number;
  projectedLevelAfter?: CEFRCode;
  submissionKey?: string;
  targetCompetencyCode?: string;
  relatedCompetencyCodes: string[];
  evidenceIntent?: string;
  contextKey?: string;
  taskType?: string;
  pronunciationEligible: boolean;
  listeningEligible: boolean;
  competencyCandidates: ExamCompetencyCandidateDTO[];
  competencyObservationIds: string[];
  competencySyncStatus: "not-required" | "pending" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function toSessionDTO(doc: SessionLean): ExamSessionDTO {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    status: doc.status,
    abilityEstimate: doc.abilityEstimate,
    turnCount: doc.turnCount,
    recentProjectedLevels: [...doc.recentProjectedLevels] as CEFRCode[],
    coveredGoalKeys: [...doc.coveredGoalKeys],
    finalLevel: (doc.finalLevel as CEFRCode | undefined) ?? undefined,
    completedAt: doc.completedAt ? doc.completedAt.toISOString() : undefined,
    targetedCompetencyCodes: [...(doc.targetedCompetencyCodes ?? [])],
    recentCompetencyProjectionLevels: [...(doc.recentCompetencyProjectionLevels ?? [])] as CEFRCode[],
    recentCompetencyProjectionConfidences: [...(doc.recentCompetencyProjectionConfidences ?? [])],
    profileNeedsTeacherReview: doc.profileNeedsTeacherReview ?? false,
    completionReason:
      (doc.completionReason as ExamSessionDTO["completionReason"] | undefined) ?? undefined,
    competencyProjection: doc.competencyProjection?.estimatedLevel
      ? {
          estimatedLevel: doc.competencyProjection.estimatedLevel as CEFRCode,
          strictAchievedLevel:
            (doc.competencyProjection.strictAchievedLevel as CEFRCode | undefined) ?? undefined,
          confidence: doc.competencyProjection.confidence ?? 0,
          confidenceBand:
            (doc.competencyProjection.confidenceBand as "low" | "medium" | "high") ?? "low",
          usedLegacyFallback: doc.competencyProjection.usedLegacyFallback ?? false,
          validObservationCount: doc.competencyProjection.validObservationCount ?? 0,
          distinctDomainCount: doc.competencyProjection.distinctDomainCount ?? 0,
          domainScores: (doc.competencyProjection.domainScores ?? []).map((entry) => ({
            domain: entry.domain ?? "",
            support: entry.support ?? 0,
            observationCount: entry.observationCount ?? 0,
          })),
        }
      : undefined,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toTurnDTO(doc: TurnLean): ExamTurnDTO {
  const score = doc.aiScore;
  return {
    id: String(doc._id),
    sessionId: String(doc.sessionId),
    userId: String(doc.userId),
    index: doc.index,
    status: doc.status,
    targetLevel: doc.targetLevel as CEFRCode,
    targetedSkill: doc.targetedSkill as ExamSkill,
    targetedGoal: doc.targetedGoal,
    goalKey: doc.goalKey,
    question: doc.question,
    studentAnswer: doc.studentAnswer ?? undefined,
    aiScore:
      score && score.criteria
        ? {
            criteria: {
              accuracy: score.criteria.accuracy,
              grammar: score.criteria.grammar,
              vocabulary: score.criteria.vocabulary,
              taskCompletion: score.criteria.taskCompletion,
            },
            overallScore: score.overallScore,
            evidence: [...score.evidence],
            strengths: [...score.strengths],
            weaknesses: [...score.weaknesses],
            confidence: score.confidence,
          }
        : undefined,
    confidence: doc.confidence ?? undefined,
    needsTeacherReview: doc.needsTeacherReview,
    abilityBefore: doc.abilityBefore,
    abilityAfter: doc.abilityAfter ?? undefined,
    projectedLevelAfter: (doc.projectedLevelAfter as CEFRCode | undefined) ?? undefined,
    submissionKey: doc.submissionKey ?? undefined,
    targetCompetencyCode: doc.targetCompetencyCode ?? undefined,
    relatedCompetencyCodes: [...(doc.relatedCompetencyCodes ?? [])],
    evidenceIntent: doc.evidenceIntent ?? undefined,
    contextKey: doc.contextKey ?? undefined,
    taskType: doc.taskType ?? undefined,
    pronunciationEligible: doc.pronunciationEligible ?? false,
    listeningEligible: doc.listeningEligible ?? false,
    competencyCandidates: (doc.competencyCandidates ?? []).map((candidate) => ({
      competencyCode: candidate.competencyCode,
      result: candidate.result as ExamCompetencyCandidateDTO["result"],
      accuracy: candidate.accuracy,
      confidence: candidate.confidence,
      independence: candidate.independence as ExamCompetencyCandidateDTO["independence"],
      evidenceExcerpt: candidate.evidenceExcerpt,
    })),
    competencyObservationIds: (doc.competencyObservationIds ?? []).map((id) => String(id)),
    competencySyncStatus:
      (doc.competencySyncStatus as ExamTurnDTO["competencySyncStatus"] | undefined) ?? "not-required",
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function getActiveExamForUser(
  userId: string,
): Promise<ExamSessionDTO | null> {
  await connectToDatabase();
  const doc = await ExamSession.findOne({ userId, status: "active" }).lean<SessionLean | null>();
  return doc ? toSessionDTO(doc) : null;
}

export async function getExamByIdForUser(
  sessionId: string,
  userId: string,
): Promise<ExamSessionDTO | null> {
  await connectToDatabase();
  const doc = await ExamSession.findOne({ _id: sessionId, userId }).lean<SessionLean | null>();
  return doc ? toSessionDTO(doc) : null;
}

export async function getCompletedExamForUser(
  userId: string,
): Promise<ExamSessionDTO | null> {
  await connectToDatabase();
  const doc = await ExamSession.findOne({ userId, status: "completed" })
    .sort({ completedAt: -1, updatedAt: -1 })
    .lean<SessionLean | null>();
  return doc ? toSessionDTO(doc) : null;
}

export async function createExamSession(userId: string): Promise<ExamSessionDTO> {
  await connectToDatabase();
  try {
    const doc = await ExamSession.create({ userId, abilityEstimate: 1.5 });
    return toSessionDTO(doc.toObject() as SessionLean);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const existing = await ExamSession.findOne({ userId, status: "active" }).lean<SessionLean | null>();
      if (existing) return toSessionDTO(existing);
    }
    throw error;
  }
}

export async function getCurrentTurn(sessionId: string): Promise<ExamTurnDTO | null> {
  await connectToDatabase();
  const doc = await ExamTurn.findOne({ sessionId, status: "awaiting-answer" })
    .sort({ index: -1 })
    .lean<TurnLean | null>();
  return doc ? toTurnDTO(doc) : null;
}

export async function getTurnById(
  turnId: string,
  sessionId: string,
): Promise<ExamTurnDTO | null> {
  await connectToDatabase();
  const doc = await ExamTurn.findOne({ _id: turnId, sessionId }).lean<TurnLean | null>();
  return doc ? toTurnDTO(doc) : null;
}

export interface CreateQuestionTurnInput {
  sessionId: string;
  userId: string;
  index: number;
  targetLevel: CEFRCode;
  targetedSkill: ExamSkill;
  targetedGoal: string;
  goalKey: string;
  question: string;
  abilityBefore: number;
  questionAiCallId?: string;
  targetCompetencyCode?: string;
  relatedCompetencyCodes?: string[];
  evidenceIntent?: EvidenceIntent;
  contextKey?: string;
  taskType?: TaskType;
  pronunciationEligible?: boolean;
  listeningEligible?: boolean;
}

export async function createQuestionTurn(
  input: CreateQuestionTurnInput,
): Promise<ExamTurnDTO> {
  await connectToDatabase();
  try {
    const doc = await ExamTurn.create({
      sessionId: input.sessionId,
      userId: input.userId,
      index: input.index,
      status: "awaiting-answer",
      targetLevel: input.targetLevel,
      targetedSkill: input.targetedSkill,
      targetedGoal: input.targetedGoal,
      goalKey: input.goalKey,
      question: input.question,
      abilityBefore: input.abilityBefore,
      needsTeacherReview: false,
      questionAiCallId: input.questionAiCallId,
      targetCompetencyCode: input.targetCompetencyCode,
      relatedCompetencyCodes: input.relatedCompetencyCodes ?? [],
      evidenceIntent: input.evidenceIntent,
      contextKey: input.contextKey,
      taskType: input.taskType,
      pronunciationEligible: input.pronunciationEligible ?? false,
      listeningEligible: input.listeningEligible ?? false,
      competencySyncStatus: "not-required",
    });
    return toTurnDTO(doc.toObject() as TurnLean);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const existing = await ExamTurn.findOne({
        sessionId: input.sessionId,
        index: input.index,
      }).lean<TurnLean | null>();
      if (existing) return toTurnDTO(existing);
    }
    throw error;
  }
}

export interface ClaimTurnSubmissionInput {
  turnId: string;
  sessionId: string;
  userId: string;
  submissionKey: string;
  answer: string;
}

/**
 * Atomically attach an answer to an awaiting turn. Returns the claimed turn, or
 * null when the turn is not claimable (already answered/scored, or not owned).
 */
export async function claimTurnSubmission(
  input: ClaimTurnSubmissionInput,
): Promise<ExamTurnDTO | null> {
  await connectToDatabase();
  try {
    const doc = await ExamTurn.findOneAndUpdate(
      {
        _id: input.turnId,
        sessionId: input.sessionId,
        userId: input.userId,
        status: "awaiting-answer",
        studentAnswer: { $exists: false },
      },
      { $set: { studentAnswer: input.answer, submissionKey: input.submissionKey } },
      { returnDocument: "after" },
    ).lean<TurnLean | null>();
    return doc ? toTurnDTO(doc) : null;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const existing = await ExamTurn.findOne({
        sessionId: input.sessionId,
        submissionKey: input.submissionKey,
      }).lean<TurnLean | null>();
      if (existing) return toTurnDTO(existing);
    }
    throw error;
  }
}

export interface SaveScoredTurnInput {
  turnId: string;
  sessionId: string;
  aiScore: ExamScoreDTO;
  confidence: number;
  needsTeacherReview: boolean;
  abilityAfter: number;
  projectedLevelAfter: CEFRCode;
  scoreAiCallId?: string;
  competencyCandidates?: ExamCompetencyCandidateDTO[];
}

export async function saveScoredTurn(
  input: SaveScoredTurnInput,
): Promise<ExamTurnDTO | null> {
  await connectToDatabase();
  const doc = await ExamTurn.findOneAndUpdate(
    { _id: input.turnId, sessionId: input.sessionId, status: "awaiting-answer" },
    {
      $set: {
        status: "scored",
        aiScore: input.aiScore,
        confidence: input.confidence,
        needsTeacherReview: input.needsTeacherReview,
        abilityAfter: input.abilityAfter,
        projectedLevelAfter: input.projectedLevelAfter,
        scoreAiCallId: input.scoreAiCallId,
        competencyCandidates: input.competencyCandidates ?? [],
        competencySyncStatus: input.competencyCandidates?.length ? "pending" : "not-required",
      },
    },
    { returnDocument: "after" },
  ).lean<TurnLean | null>();
  if (doc) return toTurnDTO(doc);
  // Already scored (idempotent retry): return the existing scored turn.
  const existing = await ExamTurn.findOne({
    _id: input.turnId,
    sessionId: input.sessionId,
  }).lean<TurnLean | null>();
  return existing ? toTurnDTO(existing) : null;
}

/** Mark a scored turn's competency observations synced (idempotent). */
export async function markExamTurnCompetencySynced(input: {
  turnId: string;
  sessionId: string;
  observationIds: string[];
}): Promise<void> {
  await connectToDatabase();
  await ExamTurn.updateOne(
    { _id: input.turnId, sessionId: input.sessionId },
    {
      $set: {
        competencyObservationIds: input.observationIds.map((id) => new mongoose.Types.ObjectId(id)),
        competencySyncStatus: "completed",
      },
    },
  );
}

export async function markExamTurnCompetencyFailed(input: {
  turnId: string;
  sessionId: string;
}): Promise<void> {
  await connectToDatabase();
  await ExamTurn.updateOne(
    { _id: input.turnId, sessionId: input.sessionId },
    { $set: { competencySyncStatus: "failed" } },
  );
}

/** Persist the latest competency projection + rolling history on the session. */
export async function applyExamCompetencyProjection(input: {
  sessionId: string;
  projection: ExamCompetencyProjectionDTO;
  targetedCompetencyCodes: string[];
}): Promise<ExamSessionDTO | null> {
  await connectToDatabase();
  const session = await ExamSession.findOne({ _id: input.sessionId }).lean<SessionLean | null>();
  if (!session) return null;

  const levels = [
    ...(session.recentCompetencyProjectionLevels ?? []),
    input.projection.estimatedLevel,
  ].slice(-3);
  const confidences = [
    ...(session.recentCompetencyProjectionConfidences ?? []),
    input.projection.confidence,
  ].slice(-3);
  const targeted = Array.from(
    new Set([...(session.targetedCompetencyCodes ?? []), ...input.targetedCompetencyCodes]),
  );

  const doc = await ExamSession.findOneAndUpdate(
    { _id: input.sessionId },
    {
      $set: {
        competencyProjection: input.projection,
        recentCompetencyProjectionLevels: levels,
        recentCompetencyProjectionConfidences: confidences,
        targetedCompetencyCodes: targeted,
      },
    },
    { returnDocument: "after" },
  ).lean<SessionLean | null>();
  return doc ? toSessionDTO(doc) : null;
}

/**
 * Recompute session aggregates from the scored turns. Idempotent: replaying the
 * same turn never double-counts turnCount, ability, levels, or coverage.
 */
export async function advanceSession(input: {
  sessionId: string;
}): Promise<ExamSessionDTO | null> {
  await connectToDatabase();
  const turns = await ExamTurn.find({ sessionId: input.sessionId })
    .sort({ index: 1 })
    .lean<TurnLean[]>();

  const scored = turns.filter((turn) => turn.status === "scored");
  const lastScored = scored[scored.length - 1];

  const recentProjectedLevels = scored
    .map((turn) => turn.projectedLevelAfter)
    .filter((level): level is CEFRCode => typeof level === "string");
  const coveredGoalKeys = Array.from(new Set(turns.map((turn) => turn.goalKey)));

  const doc = await ExamSession.findOneAndUpdate(
    { _id: input.sessionId },
    {
      $set: {
        turnCount: scored.length,
        abilityEstimate: lastScored?.abilityAfter ?? 1.5,
        recentProjectedLevels,
        coveredGoalKeys,
      },
    },
    { returnDocument: "after" },
  ).lean<SessionLean | null>();
  return doc ? toSessionDTO(doc) : null;
}

export async function listScoredTurns(sessionId: string): Promise<ExamTurnDTO[]> {
  await connectToDatabase();
  const docs = await ExamTurn.find({ sessionId, status: "scored" })
    .sort({ index: 1 })
    .lean<TurnLean[]>();
  return docs.map(toTurnDTO);
}

/**
 * Mark the session completed and stamp the user's placement. Uses a transaction
 * where supported; otherwise ordered idempotent updates. Both updates are
 * idempotent so a retry never corrupts state.
 */
export async function completeExam(input: {
  sessionId: string;
  userId: string;
  finalLevel: CEFRCode;
  completionReason?: "converged" | "hard-stop" | "legacy-fallback";
  profileNeedsTeacherReview?: boolean;
}): Promise<ExamSessionDTO | null> {
  await connectToDatabase();

  const sessionFilter = { _id: input.sessionId, userId: input.userId };
  const sessionUpdate = {
    $set: {
      status: "completed" as const,
      finalLevel: input.finalLevel,
      completedAt: new Date(),
      ...(input.completionReason ? { completionReason: input.completionReason } : {}),
      ...(input.profileNeedsTeacherReview !== undefined
        ? { profileNeedsTeacherReview: input.profileNeedsTeacherReview }
        : {}),
    },
  };
  const userUpdate = {
    $set: { cefrLevel: input.finalLevel, placementStatus: "completed" as const },
  };

  const dbSession = await mongoose.startSession();
  try {
    await dbSession.withTransaction(async () => {
      await ExamSession.updateOne(
        { ...sessionFilter, status: { $ne: "completed" } },
        sessionUpdate,
        { session: dbSession },
      );
      await User.updateOne({ _id: input.userId }, userUpdate, { session: dbSession });
    });
  } catch {
    // Standalone Mongo (no transactions): fall back to ordered idempotent writes.
    await ExamSession.updateOne(
      { ...sessionFilter, status: { $ne: "completed" } },
      sessionUpdate,
    );
    await User.updateOne({ _id: input.userId }, userUpdate);
  } finally {
    await dbSession.endSession();
  }

  const doc = await ExamSession.findOne(sessionFilter).lean<SessionLean | null>();
  return doc ? toSessionDTO(doc) : null;
}
