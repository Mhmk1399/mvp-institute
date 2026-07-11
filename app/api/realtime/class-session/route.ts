import { createHash } from "node:crypto";

import { getCurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getClassByIdForUser } from "@/lib/services/class";
import { createRealtimeAttachToken } from "@/lib/realtime/voice-session";

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
    "event=realtime.session.failed",
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

  const session = await getClassByIdForUser(sessionId, user.id);
  if (!session) return errorResponse("Not allowed", 403);
  if (session.status !== "active") return errorResponse("Class is not active", 409);

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
        "Do not respond automatically. Wait for an explicit response.create event from the trusted server.",
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
    return errorResponse("Realtime session could not be created", 502);
  }

  if (!upstream.ok) {
    logFailure("OPENAI_SESSION_REJECTED", user.id, sessionId);
    return errorResponse("Realtime session could not be created", 502);
  }

  const location = upstream.headers.get("location");
  const callId = location?.split("/").filter(Boolean).pop();
  const answer = await upstream.text();
  if (!callId || !answer.trim()) {
    logFailure("OPENAI_MISSING_CALL", user.id, sessionId);
    return errorResponse("Realtime session could not be created", 502);
  }

  const attachToken = createRealtimeAttachToken({ userId: user.id, sessionId, callId });

  return new Response(answer, {
    status: 200,
    headers: {
      "Content-Type": "application/sdp",
      "Cache-Control": "private, no-store",
      "X-Realtime-Call-Id": callId,
      "X-Realtime-Attach-Token": attachToken,
    },
  });
}
