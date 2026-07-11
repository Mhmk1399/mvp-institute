import { getCurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getAIProvider } from "@/lib/ai/client";
import { classMessageSchema } from "@/lib/schemas/class";
import {
  promptIdentity as plannerPromptIdentity,
  buildMessages as buildPlannerMessages,
  teacherPlannerOutputSchema,
  type TeacherPlannerOutput,
} from "@/lib/ai/prompts/teacher-planner.v1";
import {
  promptIdentity as replyPromptIdentity,
  buildMessages as buildReplyMessages,
} from "@/lib/ai/prompts/class-reply.v1";
import { approveTeacherPlan, normalizeTeachingText } from "@/lib/class/teacher-plan";
import type { AIChatResult, AIJSONResult } from "@/lib/ai/types";
import {
  promptIdentity as summaryPromptIdentity,
  buildMessages as buildSummaryMessages,
  sessionSummaryOutputSchema,
} from "@/lib/ai/prompts/session-summary.v1";
import { listLevels } from "@/lib/services/level";
import {
  advanceClassSession,
  completeClassTurn,
  createProcessingTurn,
  failClassTurn,
  getClassByIdForUser,
  getClassTurnBySubmissionKey,
  getRecentClassTurns,
  listClassTurns,
} from "@/lib/services/class";

export const runtime = "nodejs";

const RECENT_TURNS = 8;
const MAX_TAUGHT_CONTEXT = 40;
const MAX_PENDING = 12;
const MAX_SUMMARY_CHARS = 3000;

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function chunkText(text: string): string[] {
  const parts = text.split(/(\s+)/);
  const chunks: string[] = [];
  let current = "";
  for (const part of parts) {
    current += part;
    if (current.length >= 24) {
      chunks.push(current);
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text];
}

/** NDJSON stream carrying only the reply text — never structured internals. */
function replyStream(turnId: string, reply: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      send({ type: "start", turnId });
      for (const text of chunkText(reply)) send({ type: "delta", text });
      send({ type: "done", turnId });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8" },
  });
}

function flattenGoals(goals: {
  grammar: string[];
  vocabulary: string[];
  functions: string[];
}): string[] {
  return [...goals.grammar, ...goals.vocabulary, ...goals.functions];
}

function compactTurns(
  turns: Array<{ studentMessage: string; aiMessage?: string }>,
): string[] {
  return turns.map(
    (turn) => `Student: ${turn.studentMessage}\nTeacher: ${turn.aiMessage ?? ""}`,
  );
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

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Not authenticated" }, 401);
  if (user.role !== "student") return json({ error: "Not allowed" }, 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Malformed request" }, 400);
  }

  const parsed = classMessageSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid request" }, 400);
  const { sessionId, message, submissionKey } = parsed.data;

  const session = await getClassByIdForUser(sessionId, user.id);
  if (!session) return json({ error: "Class not found" }, 404);
  if (session.status !== "active") return json({ error: "Class is not active" }, 409);

  // Idempotency by submission key.
  const existing = await getClassTurnBySubmissionKey(sessionId, submissionKey);
  if (existing) {
    if (existing.status === "completed" && existing.aiMessage) {
      return replyStream(existing.id, existing.aiMessage);
    }
    if (existing.status === "processing") {
      return json({ error: "Still processing. Please wait." }, 409);
    }
    return json({ error: "That message failed. Please retry.", retryable: true }, 422);
  }

  const allTurns = await listClassTurns(sessionId);
  const turn = await createProcessingTurn({
    sessionId,
    userId: user.id,
    index: allTurns.length,
    studentMessage: message,
    submissionKey,
  });
  if (turn.status === "completed" && turn.aiMessage) {
    return replyStream(turn.id, turn.aiMessage);
  }

  const levels = await listLevels();
  const levelContent = levels.find((entry) => entry.code === session.level);
  const goals = levelContent ? flattenGoals(levelContent.goals) : [];

  const recent = await getRecentClassTurns(sessionId, RECENT_TURNS);

  // Call 1: structured Teacher Planner (dedicated planner model, falls back to generation).
  let plannerResult: AIJSONResult<TeacherPlannerOutput>;
  try {
    plannerResult = await getAIProvider().chatJSON(
      {
        model: env.aiClassPlannerModel,
        messages: buildPlannerMessages({
          level: session.level,
          subject: session.subject ?? "",
          curriculumGoals: goals,
          targetedGoals: session.targetedGoals,
          pendingTargets: session.pendingElicitedTargets.slice(0, MAX_PENDING),
          taughtItems: session.taughtItems
            .slice(0, MAX_TAUGHT_CONTEXT)
            .map((item) => `${item.type}: ${item.item}`),
          recentTurns: compactTurns(recent),
          runningSummary: session.runningSummary.slice(0, MAX_SUMMARY_CHARS),
          studentMessage: message,
        }),
        prompt: plannerPromptIdentity,
        context: { userId: user.id, sessionId, turnId: turn.id },
      },
      teacherPlannerOutputSchema,
    );
  } catch {
    await failClassTurn({ sessionId, submissionKey, errorCode: "planner_unavailable" });
    return json({ error: "The teacher is unavailable. Please retry.", retryable: true }, 502);
  }

  // Deterministic approval — code validates curriculum, grounding, Persian, clamps.
  const approvedPlan = approveTeacherPlan({
    rawPlan: plannerResult.data,
    studentMessage: message,
    curriculumGoals: goals,
    targetedGoals: session.targetedGoals,
    pendingTargets: session.pendingElicitedTargets,
  });

  // Call 2: natural teacher reply (plain text, generation model).
  let replyResult: AIChatResult;
  try {
    replyResult = await getAIProvider().chat({
      model: env.aiGenerationModel,
      messages: buildReplyMessages({
        level: session.level,
        subject: session.subject ?? "",
        studentMessage: message,
        recentTurns: compactTurns(recent),
        approvedPlan,
      }),
      prompt: replyPromptIdentity,
      context: { userId: user.id, sessionId, turnId: turn.id },
    });
  } catch {
    await failClassTurn({ sessionId, submissionKey, errorCode: "reply_unavailable" });
    return json({ error: "The teacher is unavailable. Please retry.", retryable: true }, 502);
  }

  const reply = replyResult.text.trim();
  if (!reply) {
    await failClassTurn({ sessionId, submissionKey, errorCode: "reply_unavailable" });
    return json({ error: "The teacher is unavailable. Please retry.", retryable: true }, 502);
  }

  // Persist only what the reply actually delivered.
  const normalizedReply = normalizeTeachingText(reply);
  const corrections =
    approvedPlan.responsePlan.correctionApproach === "none"
      ? []
      : approvedPlan.corrections.filter((correction) =>
          normalizedReply.includes(normalizeTeachingText(correction.corrected)),
        );
  const taughtInThisTurn = approvedPlan.taught
    .filter((item) => normalizedReply.includes(normalizeTeachingText(item.teacherLine)))
    .slice(0, 1)
    .map((item) => ({ type: item.type, item: item.item, evidence: item.teacherLine }));

  await completeClassTurn({
    sessionId,
    submissionKey,
    aiMessage: reply,
    corrections,
    elicitedTargets: approvedPlan.elicited,
    taughtInThisTurn,
    resolvedTargets: approvedPlan.resolvedTargets,
    teacherDecision: approvedPlan.decision,
    responsePlan: approvedPlan.responsePlan,
    plannerAiCallId: plannerResult.logId,
    replyAiCallId: replyResult.logId,
    aiCallId: replyResult.logId,
  });

  // Deterministic pending-target update.
  const remainingPending = session.pendingElicitedTargets.filter(
    (pendingTarget) =>
      !approvedPlan.resolvedTargets.some(
        (resolved) => normalizeTeachingText(resolved) === normalizeTeachingText(pendingTarget),
      ),
  );
  const pending = dedupe(
    [...remainingPending, ...approvedPlan.elicited, ...approvedPlan.nextTargets],
    MAX_PENDING,
  );
  const advanced = await advanceClassSession({
    sessionId,
    userId: user.id,
    pendingElicitedTargets: pending,
  });

  // Periodic running-summary refresh; failure must not break the reply.
  if (advanced && advanced.turnCount > 0 && advanced.turnCount % 6 === 0) {
    try {
      const summaryTurns = await getRecentClassTurns(sessionId, RECENT_TURNS);
      const summary = await getAIProvider().chatJSON(
        {
          model: env.aiGenerationModel,
          messages: buildSummaryMessages({
            level: session.level,
            subject: session.subject ?? "",
            goals,
            recentTurns: compactTurns(summaryTurns),
            runningSummary: advanced.runningSummary,
          }),
          prompt: summaryPromptIdentity,
          context: { userId: user.id, sessionId },
        },
        sessionSummaryOutputSchema,
      );
      await advanceClassSession({
        sessionId,
        userId: user.id,
        pendingElicitedTargets: pending,
        runningSummary: summary.data.summary.slice(0, MAX_SUMMARY_CHARS),
      });
    } catch {
      // Keep the old running summary; the student reply already succeeded.
    }
  }

  return replyStream(turn.id, reply);
}
