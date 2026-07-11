import "server-only";

import { connectToDatabase } from "@/lib/db/mongoose";
import { ClassSession, type ClassSessionDoc } from "@/lib/models/class-session";
import { ClassTurn, type ClassTurnDoc } from "@/lib/models/class-turn";
import type { CEFRCode } from "@/lib/exam/engine";

type ItemType = "vocabulary" | "grammar" | "function";
type SessionLean = ClassSessionDoc & { createdAt: Date; updatedAt: Date };
type TurnLean = ClassTurnDoc & { createdAt: Date; updatedAt: Date };

export interface OfferedSubjectDTO {
  title: string;
  description: string;
  targetedGoals: string[];
}

export interface TaughtItemDTO {
  type: ItemType;
  item: string;
  evidence: string;
  turnId?: string;
}

export interface CorrectionDTO {
  original: string;
  corrected: string;
  explanation: string;
}

export interface LearnedItemDTO {
  type: ItemType;
  item: string;
  evidence: string;
}

export interface FinalSummaryDTO {
  summary: string;
  learnedItems: LearnedItemDTO[];
  strengths: string[];
  nextSteps: string[];
}

export interface ClassSessionDTO {
  id: string;
  userId: string;
  level: CEFRCode;
  status: "choosing-subject" | "active" | "completed" | "abandoned";
  subject?: string;
  offeredSubjects: OfferedSubjectDTO[];
  targetedGoals: string[];
  taughtItems: TaughtItemDTO[];
  pendingElicitedTargets: string[];
  runningSummary: string;
  finalSummary?: FinalSummaryDTO;
  turnCount: number;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClassTurnDTO {
  id: string;
  sessionId: string;
  userId: string;
  index: number;
  status: "processing" | "completed" | "failed";
  studentMessage: string;
  aiMessage?: string;
  corrections: CorrectionDTO[];
  elicitedTargets: string[];
  taughtInThisTurn: LearnedItemDTO[];
  resolvedTargets: string[];
  teacherDecision?: {
    move: string;
    reason: string;
    targetGoal?: string;
    turnObjective: string;
    languageMode: string;
  };
  responsePlan?: {
    acknowledgement?: string;
    correctionApproach: string;
    teachingPoint?: string;
    followUpQuestion?: string;
    maximumReplySentences: number;
  };
  plannerAiCallId?: string;
  replyAiCallId?: string;
  inputMode?: "text" | "voice";
  transcription?: {
    provider: string;
    model: string;
    transcript: string;
    completedAt: string;
  };
  realtimeResponseId?: string;
  submissionKey: string;
  errorCode?: string;
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

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeStrings(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
    if (out.length >= max) break;
  }
  return out;
}

function toSessionDTO(doc: SessionLean): ClassSessionDTO {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    level: doc.level as CEFRCode,
    status: doc.status,
    subject: doc.subject ?? undefined,
    offeredSubjects: doc.offeredSubjects.map((subject) => ({
      title: subject.title,
      description: subject.description,
      targetedGoals: [...subject.targetedGoals],
    })),
    targetedGoals: [...doc.targetedGoals],
    taughtItems: doc.taughtItems.map((item) => ({
      type: item.type as ItemType,
      item: item.item,
      evidence: item.evidence,
      turnId: item.turnId ? String(item.turnId) : undefined,
    })),
    pendingElicitedTargets: [...doc.pendingElicitedTargets],
    runningSummary: doc.runningSummary,
    finalSummary: doc.finalSummary
      ? {
          summary: doc.finalSummary.summary,
          learnedItems: doc.finalSummary.learnedItems.map((item) => ({
            type: item.type as ItemType,
            item: item.item,
            evidence: item.evidence,
          })),
          strengths: [...doc.finalSummary.strengths],
          nextSteps: [...doc.finalSummary.nextSteps],
        }
      : undefined,
    turnCount: doc.turnCount,
    completedAt: doc.completedAt ? doc.completedAt.toISOString() : undefined,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toTurnDTO(doc: TurnLean): ClassTurnDTO {
  return {
    id: String(doc._id),
    sessionId: String(doc.sessionId),
    userId: String(doc.userId),
    index: doc.index,
    status: doc.status,
    studentMessage: doc.studentMessage,
    aiMessage: doc.aiMessage ?? undefined,
    corrections: doc.corrections.map((correction) => ({
      original: correction.original,
      corrected: correction.corrected,
      explanation: correction.explanation,
    })),
    elicitedTargets: [...doc.elicitedTargets],
    taughtInThisTurn: doc.taughtInThisTurn.map((item) => ({
      type: item.type as ItemType,
      item: item.item,
      evidence: item.evidence,
    })),
    resolvedTargets: [...(doc.resolvedTargets ?? [])],
    teacherDecision: doc.teacherDecision
      ? {
          move: doc.teacherDecision.move,
          reason: doc.teacherDecision.reason,
          targetGoal: doc.teacherDecision.targetGoal ?? undefined,
          turnObjective: doc.teacherDecision.turnObjective,
          languageMode: doc.teacherDecision.languageMode,
        }
      : undefined,
    responsePlan: doc.responsePlan
      ? {
          acknowledgement: doc.responsePlan.acknowledgement ?? undefined,
          correctionApproach: doc.responsePlan.correctionApproach,
          teachingPoint: doc.responsePlan.teachingPoint ?? undefined,
          followUpQuestion: doc.responsePlan.followUpQuestion ?? undefined,
          maximumReplySentences: doc.responsePlan.maximumReplySentences,
        }
      : undefined,
    plannerAiCallId: doc.plannerAiCallId ? String(doc.plannerAiCallId) : undefined,
    replyAiCallId: doc.replyAiCallId ? String(doc.replyAiCallId) : undefined,
    inputMode: (doc.inputMode as "text" | "voice" | undefined) ?? undefined,
    transcription:
      doc.transcription && doc.transcription.transcript
        ? {
            provider: doc.transcription.provider ?? "openai",
            model: doc.transcription.model ?? "",
            transcript: doc.transcription.transcript,
            completedAt: doc.transcription.completedAt
              ? doc.transcription.completedAt.toISOString()
              : "",
          }
        : undefined,
    realtimeResponseId: doc.realtimeResponseId ?? undefined,
    submissionKey: doc.submissionKey,
    errorCode: doc.errorCode ?? undefined,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

const OPEN_STATUSES = ["choosing-subject", "active"] as const;

export async function getOpenClassForUser(userId: string): Promise<ClassSessionDTO | null> {
  await connectToDatabase();
  const doc = await ClassSession.findOne({
    userId,
    status: { $in: [...OPEN_STATUSES] },
  }).lean<SessionLean | null>();
  return doc ? toSessionDTO(doc) : null;
}

export async function getClassByIdForUser(
  sessionId: string,
  userId: string,
): Promise<ClassSessionDTO | null> {
  await connectToDatabase();
  const doc = await ClassSession.findOne({ _id: sessionId, userId }).lean<SessionLean | null>();
  return doc ? toSessionDTO(doc) : null;
}

export async function getCompletedClassForUser(
  sessionId: string,
  userId: string,
): Promise<ClassSessionDTO | null> {
  await connectToDatabase();
  const doc = await ClassSession.findOne({
    _id: sessionId,
    userId,
    status: "completed",
  }).lean<SessionLean | null>();
  return doc ? toSessionDTO(doc) : null;
}

/** Subjects of the user's most recent completed classes (for de-duplication). */
export async function listPreviousSubjects(
  userId: string,
  limit: number,
): Promise<string[]> {
  await connectToDatabase();
  const docs = await ClassSession.find({
    userId,
    status: "completed",
    subject: { $exists: true, $ne: null },
  })
    .sort({ completedAt: -1 })
    .limit(limit)
    .select("subject")
    .lean<Array<{ subject?: string }>>();
  return docs
    .map((doc) => doc.subject)
    .filter((subject): subject is string => Boolean(subject));
}

export async function createChoosingSession(input: {
  userId: string;
  level: CEFRCode;
}): Promise<ClassSessionDTO> {
  await connectToDatabase();
  try {
    const doc = await ClassSession.create({
      userId: input.userId,
      level: input.level,
      status: "choosing-subject",
    });
    return toSessionDTO(doc.toObject() as SessionLean);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const existing = await ClassSession.findOne({
        userId: input.userId,
        status: { $in: [...OPEN_STATUSES] },
      }).lean<SessionLean | null>();
      if (existing) return toSessionDTO(existing);
    }
    throw error;
  }
}

export async function saveOfferedSubjects(input: {
  sessionId: string;
  userId: string;
  offeredSubjects: OfferedSubjectDTO[];
  subjectPickerAiCallId?: string;
}): Promise<ClassSessionDTO | null> {
  await connectToDatabase();
  const doc = await ClassSession.findOneAndUpdate(
    { _id: input.sessionId, userId: input.userId, status: "choosing-subject" },
    {
      $set: {
        offeredSubjects: input.offeredSubjects,
        subjectPickerAiCallId: input.subjectPickerAiCallId,
      },
    },
    { returnDocument: "after" },
  ).lean<SessionLean | null>();
  return doc ? toSessionDTO(doc) : null;
}

export async function activateClass(input: {
  sessionId: string;
  userId: string;
  subject: string;
  targetedGoals: string[];
}): Promise<ClassSessionDTO | null> {
  await connectToDatabase();
  const doc = await ClassSession.findOneAndUpdate(
    { _id: input.sessionId, userId: input.userId, status: "choosing-subject" },
    {
      $set: {
        subject: input.subject,
        targetedGoals: input.targetedGoals,
        status: "active",
      },
    },
    { returnDocument: "after" },
  ).lean<SessionLean | null>();
  return doc ? toSessionDTO(doc) : null;
}

export async function listClassTurns(sessionId: string): Promise<ClassTurnDTO[]> {
  await connectToDatabase();
  const docs = await ClassTurn.find({ sessionId }).sort({ index: 1 }).lean<TurnLean[]>();
  return docs.map(toTurnDTO);
}

export async function getRecentClassTurns(
  sessionId: string,
  limit: number,
): Promise<ClassTurnDTO[]> {
  await connectToDatabase();
  const docs = await ClassTurn.find({ sessionId, status: "completed" })
    .sort({ index: -1 })
    .limit(limit)
    .lean<TurnLean[]>();
  return docs.reverse().map(toTurnDTO);
}

export async function getClassTurnBySubmissionKey(
  sessionId: string,
  submissionKey: string,
): Promise<ClassTurnDTO | null> {
  await connectToDatabase();
  const doc = await ClassTurn.findOne({ sessionId, submissionKey }).lean<TurnLean | null>();
  return doc ? toTurnDTO(doc) : null;
}

export async function createProcessingTurn(input: {
  sessionId: string;
  userId: string;
  index: number;
  studentMessage: string;
  submissionKey: string;
  inputMode?: "text" | "voice";
}): Promise<ClassTurnDTO> {
  await connectToDatabase();
  try {
    const doc = await ClassTurn.create({
      sessionId: input.sessionId,
      userId: input.userId,
      index: input.index,
      status: "processing",
      studentMessage: input.studentMessage,
      submissionKey: input.submissionKey,
      inputMode: input.inputMode,
    });
    return toTurnDTO(doc.toObject() as TurnLean);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const existing = await ClassTurn.findOne({
        sessionId: input.sessionId,
        submissionKey: input.submissionKey,
      }).lean<TurnLean | null>();
      if (existing) return toTurnDTO(existing);
    }
    throw error;
  }
}

export async function completeClassTurn(input: {
  sessionId: string;
  submissionKey: string;
  aiMessage: string;
  corrections: CorrectionDTO[];
  elicitedTargets: string[];
  taughtInThisTurn: LearnedItemDTO[];
  resolvedTargets?: string[];
  teacherDecision?: ClassTurnDTO["teacherDecision"];
  responsePlan?: ClassTurnDTO["responsePlan"];
  plannerAiCallId?: string;
  replyAiCallId?: string;
  aiCallId?: string;
  inputMode?: "text" | "voice";
  transcription?: { provider: "openai"; model: string; transcript: string; completedAt: Date };
  realtimeResponseId?: string;
}): Promise<ClassTurnDTO | null> {
  await connectToDatabase();
  const doc = await ClassTurn.findOneAndUpdate(
    { sessionId: input.sessionId, submissionKey: input.submissionKey, status: "processing" },
    {
      $set: {
        status: "completed",
        aiMessage: input.aiMessage,
        corrections: input.corrections,
        elicitedTargets: input.elicitedTargets,
        taughtInThisTurn: input.taughtInThisTurn,
        resolvedTargets: input.resolvedTargets ?? [],
        teacherDecision: input.teacherDecision,
        responsePlan: input.responsePlan,
        plannerAiCallId: input.plannerAiCallId,
        replyAiCallId: input.replyAiCallId,
        aiCallId: input.aiCallId,
        inputMode: input.inputMode,
        transcription: input.transcription,
        realtimeResponseId: input.realtimeResponseId,
      },
    },
    { returnDocument: "after" },
  ).lean<TurnLean | null>();
  if (doc) return toTurnDTO(doc);
  const existing = await ClassTurn.findOne({
    sessionId: input.sessionId,
    submissionKey: input.submissionKey,
  }).lean<TurnLean | null>();
  return existing ? toTurnDTO(existing) : null;
}

export async function failClassTurn(input: {
  sessionId: string;
  submissionKey: string;
  errorCode: string;
}): Promise<ClassTurnDTO | null> {
  await connectToDatabase();
  const doc = await ClassTurn.findOneAndUpdate(
    { sessionId: input.sessionId, submissionKey: input.submissionKey, status: "processing" },
    { $set: { status: "failed", errorCode: input.errorCode } },
    { returnDocument: "after" },
  ).lean<TurnLean | null>();
  return doc ? toTurnDTO(doc) : null;
}

/**
 * Recompute session aggregates from completed turns. Idempotent: replays never
 * double-count turnCount or duplicate taught items (deduped by type + item).
 */
export async function advanceClassSession(input: {
  sessionId: string;
  userId: string;
  pendingElicitedTargets: string[];
  runningSummary?: string;
}): Promise<ClassSessionDTO | null> {
  await connectToDatabase();
  const turns = await ClassTurn.find({ sessionId: input.sessionId, status: "completed" })
    .sort({ index: 1 })
    .lean<TurnLean[]>();

  const seen = new Set<string>();
  const taughtItems: TaughtItemDTO[] = [];
  for (const turn of turns) {
    for (const item of turn.taughtInThisTurn) {
      const key = `${item.type}:${normalize(item.item)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      taughtItems.push({
        type: item.type as ItemType,
        item: item.item,
        evidence: item.evidence,
        turnId: String(turn._id),
      });
    }
  }

  const set: Record<string, unknown> = {
    turnCount: turns.length,
    taughtItems,
    pendingElicitedTargets: dedupeStrings(input.pendingElicitedTargets, 12),
  };
  if (typeof input.runningSummary === "string") {
    set.runningSummary = input.runningSummary;
  }

  const doc = await ClassSession.findOneAndUpdate(
    { _id: input.sessionId, userId: input.userId },
    { $set: set },
    { returnDocument: "after" },
  ).lean<SessionLean | null>();
  return doc ? toSessionDTO(doc) : null;
}

export async function completeClassSession(input: {
  sessionId: string;
  userId: string;
  finalSummary: FinalSummaryDTO;
  summaryAiCallId?: string;
}): Promise<ClassSessionDTO | null> {
  await connectToDatabase();
  await ClassSession.updateOne(
    { _id: input.sessionId, userId: input.userId, status: "active" },
    {
      $set: {
        status: "completed",
        finalSummary: input.finalSummary,
        summaryAiCallId: input.summaryAiCallId,
        completedAt: new Date(),
      },
    },
  );
  const doc = await ClassSession.findOne({
    _id: input.sessionId,
    userId: input.userId,
  }).lean<SessionLean | null>();
  return doc ? toSessionDTO(doc) : null;
}
