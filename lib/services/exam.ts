import "server-only";

import mongoose from "mongoose";

import { connectToDatabase } from "@/lib/db/mongoose";
import { User } from "@/lib/models/user";
import { ExamSession, type ExamSessionDoc } from "@/lib/models/exam-session";
import { ExamTurn, type ExamTurnDoc } from "@/lib/models/exam-turn";
import type { CEFRCode, ExamSkill } from "@/lib/exam/engine";

type SessionLean = ExamSessionDoc & { createdAt: Date; updatedAt: Date };
type TurnLean = ExamTurnDoc & { createdAt: Date; updatedAt: Date };

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
}): Promise<ExamSessionDTO | null> {
  await connectToDatabase();

  const sessionFilter = { _id: input.sessionId, userId: input.userId };
  const sessionUpdate = {
    $set: {
      status: "completed" as const,
      finalLevel: input.finalLevel,
      completedAt: new Date(),
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
