import { createHash } from "node:crypto";

import { getCurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getExamByIdForUser } from "@/lib/services/exam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SDP_BYTES = 64 * 1024;

function errorResponse(message: string, status: number): Response {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

function logFailure(code: string, userId?: string, sessionId?: string): void {
  console.warn(
    "event=exam.realtime.failed",
    `errorCode=${code}`,
    userId ? `userId=${userId}` : "userId=unknown",
    sessionId ? `sessionId=${sessionId}` : "sessionId=unknown",
  );
}

async function readSdp(request: Request): Promise<{ sdp?: string; tooLarge: boolean }> {
  if (!request.body) return { tooLarge: false };
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let sdp = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_SDP_BYTES) {
      await reader.cancel();
      return { tooLarge: true };
    }
    sdp += decoder.decode(value, { stream: true });
  }
  sdp += decoder.decode();
  return { sdp, tooLarge: false };
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Not authenticated", 401);
  if (user.role !== "student") return errorResponse("Not allowed", 403);

  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId || !/^[a-f\d]{24}$/i.test(sessionId)) {
    return errorResponse("Invalid session", 400);
  }

  const exam = await getExamByIdForUser(sessionId, user.id);
  if (!exam) return errorResponse("Not allowed", 403);
  if (exam.status !== "active") return errorResponse("Exam is not active", 409);

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_SDP_BYTES) {
    return errorResponse("SDP is too large", 413);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/sdp")) {
    return errorResponse("Invalid SDP", 400);
  }

  let body: { sdp?: string; tooLarge: boolean };
  try {
    body = await readSdp(request);
  } catch {
    return errorResponse("Invalid SDP", 400);
  }
  if (body.tooLarge) return errorResponse("SDP is too large", 413);
  const sdp = body.sdp ?? "";
  if (!sdp.trim()) return errorResponse("Invalid SDP", 400);

  const form = new FormData();
  form.set("sdp", sdp);
  form.set(
    "session",
    JSON.stringify({
      type: "realtime",
      model: env.aiRealtimeModel,
      output_modalities: ["audio"],
      instructions:
        "You are an exam narrator. Read aloud exactly the text you are given, warmly and clearly. Never add commentary, never answer for the student, and never reveal scores or corrections.",
      audio: {
        input: {
          transcription: {
            model: env.aiTranscriptionModel,
            delay: env.aiTranscriptionDelay,
          },
          turn_detection: null,
        },
        output: { voice: env.aiRealtimeVoice },
      },
    }),
  );

  const safetyIdentifier = createHash("sha256").update(user.id).digest("hex");
  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.openaiApiKey}`,
        "OpenAI-Safety-Identifier": safetyIdentifier,
      },
      body: form,
      cache: "no-store",
    });
  } catch {
    logFailure("OPENAI_SESSION_FAILED", user.id, sessionId);
    return errorResponse("Voice session could not be created", 502);
  }

  if (!upstream.ok) {
    logFailure("OPENAI_SESSION_REJECTED", user.id, sessionId);
    return errorResponse("Voice session could not be created", 502);
  }

  const answer = await upstream.text();
  if (!answer.trim()) {
    logFailure("OPENAI_EMPTY_ANSWER", user.id, sessionId);
    return errorResponse("Voice session could not be created", 502);
  }

  return new Response(answer, {
    status: 200,
    headers: {
      "Content-Type": "application/sdp",
      "Cache-Control": "private, no-store",
    },
  });
}
