"use server";

import { requireRole } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { getAIProvider } from "@/lib/ai/client";
import {
  promptIdentity as examQuestionPromptIdentity,
  buildMessages as buildExamQuestionMessages,
  examQuestionOutputSchema,
} from "@/lib/ai/prompts/exam-question.v1";
import {
  promptIdentity as scorePromptIdentity,
  buildMessages as buildScoreMessages,
  scoreAnswerOutputSchema,
  type ScoreAnswerOutput,
} from "@/lib/ai/prompts/score-answer.v1";
import type { AIJSONResult } from "@/lib/ai/types";
import { submitExamAnswerSchema } from "@/lib/schemas/exam";
import { listLevels } from "@/lib/services/level";
import {
  abilityToLevel,
  calculateAbilityAfter,
  calculateFinalLevel,
  selectNextTarget,
  shouldFinishExam,
  type CEFRCode,
  type EngineLevel,
} from "@/lib/exam/engine";
import {
  advanceSession,
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
  saveScoredTurn,
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
  | {
      status: "error";
      formError?: string;
      fieldErrors?: Record<string, string[]>;
      retryable?: boolean;
    };

function publicTurn(turn: ExamTurnDTO): PublicTurn {
  return { id: turn.id, index: turn.index, question: turn.question };
}

/** Select the next target, generate a question, and persist the new turn. */
async function generateNextQuestion(
  session: ExamSessionDTO,
  userId: string,
): Promise<ExamTurnDTO> {
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
  const avoidQuestions = scored.map((turn) => turn.question).slice(-12);

  const result = await getAIProvider().chatJSON(
    {
      model: env.aiGenerationModel,
      messages: buildExamQuestionMessages({
        targetLevel: target.targetLevel,
        skill: target.targetedSkill,
        goal: target.targetedGoal,
        avoidQuestions,
      }),
      prompt: examQuestionPromptIdentity,
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

/** Apply the deterministic stop rule after a turn is scored, then continue. */
async function finalizeAfterScore(
  sessionId: string,
  userId: string,
): Promise<ExamActionResult> {
  const session = await advanceSession({ sessionId });
  if (!session) return { status: "error", formError: "Exam not found." };

  const scored = await listScoredTurns(sessionId);
  const projectedLevels = scored
    .map((turn) => turn.projectedLevelAfter)
    .filter((level): level is CEFRCode => Boolean(level));
  const confidences = scored.map((turn) => turn.confidence ?? 0);

  if (
    shouldFinishExam({
      turnCount: session.turnCount,
      recentProjectedLevels: projectedLevels,
      recentConfidences: confidences,
    })
  ) {
    const finalLevel = calculateFinalLevel({
      abilityEstimate: session.abilityEstimate,
      recentProjectedLevels: projectedLevels,
    });
    await completeExam({ sessionId, userId, finalLevel });
    return { status: "completed", finalLevel };
  }

  try {
    const current = await getCurrentTurn(sessionId);
    const turn = current ?? (await generateNextQuestion(session, userId));
    return {
      status: "active",
      sessionId,
      turn: publicTurn(turn),
      answered: session.turnCount,
    };
  } catch {
    return {
      status: "error",
      formError: "Could not load the next question. Please retry.",
      retryable: true,
    };
  }
}

export async function startPlacementExamAction(): Promise<ExamActionResult> {
  const user = await requireRole("student");

  const completed = await getCompletedExamForUser(user.id);
  if (completed?.finalLevel) {
    return { status: "completed", finalLevel: completed.finalLevel };
  }

  let session = await getActiveExamForUser(user.id);
  if (session) {
    const current = await getCurrentTurn(session.id);
    if (current) {
      return {
        status: "active",
        sessionId: session.id,
        turn: publicTurn(current),
        answered: session.turnCount,
      };
    }
  } else {
    session = await createExamSession(user.id);
  }

  try {
    const turn = await generateNextQuestion(session, user.id);
    return {
      status: "active",
      sessionId: session.id,
      turn: publicTurn(turn),
      answered: session.turnCount,
    };
  } catch {
    return {
      status: "error",
      formError: "Could not start the exam. Please try again.",
      retryable: true,
    };
  }
}

export async function submitPlacementAnswerAction(
  input: unknown,
): Promise<ExamActionResult> {
  const user = await requireRole("student");

  const parsed = submitExamAnswerSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { sessionId, turnId, submissionKey, answer } = parsed.data;

  const session = await getExamByIdForUser(sessionId, user.id);
  if (!session) return { status: "error", formError: "Exam not found." };
  if (session.status === "completed") {
    return session.finalLevel
      ? { status: "completed", finalLevel: session.finalLevel }
      : { status: "error", formError: "This exam is already complete." };
  }

  let turn = await getTurnById(turnId, sessionId);
  if (!turn || turn.userId !== user.id) {
    return { status: "error", formError: "Question not found." };
  }
  if (turn.status === "scored") {
    return finalizeAfterScore(sessionId, user.id);
  }

  const claimed = await claimTurnSubmission({
    turnId,
    sessionId,
    userId: user.id,
    submissionKey,
    answer,
  });

  let answerToScore: string;
  if (claimed) {
    answerToScore = answer;
  } else {
    turn = await getTurnById(turnId, sessionId);
    if (!turn) return { status: "error", formError: "Question not found." };
    if (turn.status === "scored") return finalizeAfterScore(sessionId, user.id);
    if (turn.submissionKey === submissionKey && turn.studentAnswer) {
      // Same submission retried after a prior scoring failure.
      answerToScore = turn.studentAnswer;
    } else {
      return { status: "error", formError: "This answer was already submitted." };
    }
  }

  let scoreResult: AIJSONResult<ScoreAnswerOutput>;
  try {
    scoreResult = await getAIProvider().chatJSON(
      {
        model: env.aiScoringModel,
        messages: buildScoreMessages({
          targetLevel: turn.targetLevel,
          question: turn.question,
          targetedSkill: turn.targetedSkill,
          targetedGoal: turn.targetedGoal,
          studentAnswer: answerToScore,
        }),
        prompt: scorePromptIdentity,
        context: { userId: user.id, sessionId, turnId },
      },
      scoreAnswerOutputSchema,
    );
  } catch {
    return {
      status: "error",
      formError: "Scoring is temporarily unavailable. Please retry.",
      retryable: true,
    };
  }

  const score = scoreResult.data;
  const abilityAfter = calculateAbilityAfter({
    abilityBefore: turn.abilityBefore,
    score,
  });

  await saveScoredTurn({
    turnId,
    sessionId,
    aiScore: score,
    confidence: score.confidence,
    needsTeacherReview: score.confidence < 0.6,
    abilityAfter,
    projectedLevelAfter: abilityToLevel(abilityAfter),
    scoreAiCallId: scoreResult.logId,
  });

  return finalizeAfterScore(sessionId, user.id);
}
