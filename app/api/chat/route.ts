import { getCurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getAIProvider } from "@/lib/ai/client";
import { classMessageSchema } from "@/lib/schemas/class";
import {
  promptIdentity as replyPromptIdentity,
  buildMessages as buildReplyMessages,
} from "@/lib/ai/prompts/class-reply.v2";
import {
  prepareTeacherTurn,
  finalizeTeacherTurn,
  failTeacherTurn,
} from "@/lib/class/teacher-turn-runtime";
import type { AIChatResult } from "@/lib/ai/types";
import {
  getClassByIdForUser,
  getClassTurnBySubmissionKey,
  listClassTurns,
} from "@/lib/services/class";

export const runtime = "nodejs";

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

  // Call 1: planner + deterministic approval (shared runtime).
  let prepared;
  try {
    prepared = await prepareTeacherTurn({
      session,
      userId: user.id,
      studentMessage: message,
      submissionKey,
      index: allTurns.length,
      inputMode: "text",
    });
  } catch {
    await failTeacherTurn({ sessionId, submissionKey, errorCode: "planner_unavailable" });
    return json({ error: "The teacher is unavailable. Please retry.", retryable: true }, 502);
  }
  if (prepared.alreadyCompleted) {
    return prepared.turn.aiMessage
      ? replyStream(prepared.turn.id, prepared.turn.aiMessage)
      : json({ error: "Still processing. Please wait." }, 409);
  }
  if (!prepared.approvedPlan) {
    return json({ error: "The teacher is unavailable. Please retry.", retryable: true }, 502);
  }

  // Call 2: natural teacher reply (plain text).
  let replyResult: AIChatResult;
  try {
    replyResult = await getAIProvider().chat({
      model: env.aiGenerationModel,
      messages: buildReplyMessages({
        level: session.level,
        subject: session.subject ?? "",
        studentMessage: message,
        recentTurns: prepared.recentTurns,
        approvedPlan: prepared.approvedPlan,
      }),
      prompt: replyPromptIdentity,
      context: { userId: user.id, sessionId, turnId: prepared.turn.id },
    });
  } catch {
    await failTeacherTurn({ sessionId, submissionKey, errorCode: "reply_unavailable" });
    return json({ error: "The teacher is unavailable. Please retry.", retryable: true }, 502);
  }

  const reply = replyResult.text.trim();
  if (!reply) {
    await failTeacherTurn({ sessionId, submissionKey, errorCode: "reply_unavailable" });
    return json({ error: "The teacher is unavailable. Please retry.", retryable: true }, 502);
  }

  await finalizeTeacherTurn({
    session,
    userId: user.id,
    turnId: prepared.turn.id,
    submissionKey,
    approvedPlan: prepared.approvedPlan,
    studentMessage: message,
    finalReply: reply,
    plannerLogId: prepared.plannerLogId,
    replyLogId: replyResult.logId,
    inputMode: "text",
  });

  return replyStream(prepared.turn.id, reply);
}
