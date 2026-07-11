import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import { WebSocket, WebSocketServer, type RawData } from "ws";

import {
  parseClientRealtimeEvent,
  serializeServerRealtimeEvent,
  type ServerRealtimeEvent,
} from "@/lib/realtime/protocol";
import { RealtimeConnectionRegistry, type RealtimeConnection } from "@/lib/realtime/registry";
import type { ClassSessionDTO } from "@/lib/services/class";
import type { ApprovedTeacherPlan } from "@/lib/class/teacher-plan";
import type { OpenAISideband } from "@/lib/realtime/openai-sideband";

loadEnvConfig(process.cwd());

const JOIN_TIMEOUT_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 25_000;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_MESSAGES = 30;
const MAX_PROTOCOL_VIOLATIONS = 3;

interface VoiceTurnState {
  turnId: string;
  submissionKey: string;
  approvedPlan: ApprovedTeacherPlan;
  recentTurns: string[];
  instructions: string;
  studentTranscript: string;
  teacherTranscript: string;
  startedAt: number;
  plannerLogId?: string;
}

function rejectUpgrade(socket: import("node:stream").Duplex, status: number, message: string): void {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

function send(socket: WebSocket, event: ServerRealtimeEvent): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(serializeServerRealtimeEvent(event));
}

async function main(): Promise<void> {
  const [
    { env },
    { authenticateRealtimeRequest },
    classService,
    runtime,
    { buildRealtimeReplyInstructions, promptIdentity: realtimeReplyPromptIdentity },
    { verifyRealtimeAttachToken },
    { OpenAISideband },
    { logAICall },
  ] = await Promise.all([
    import("@/lib/env"),
    import("@/lib/realtime/auth"),
    import("@/lib/services/class"),
    import("@/lib/class/teacher-turn-runtime"),
    import("@/lib/ai/prompts/class-realtime-reply.v1"),
    import("@/lib/realtime/voice-session"),
    import("@/lib/realtime/openai-sideband"),
    import("@/lib/ai/logger"),
  ]);
  const { getClassByIdForUser, listClassTurns } = classService;
  const { prepareTeacherTurn, finalizeTeacherTurn, failTeacherTurn } = runtime;

  const allowedOrigins = new Set(env.realtimeAllowedOrigins);
  const registry = new RealtimeConnectionRegistry();
  let shuttingDown = false;

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ status: "ok", connections: registry.count() }));
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024, perMessageDeflate: false });

  server.on("upgrade", async (request, socket, head) => {
    if (shuttingDown) return rejectUpgrade(socket, 503, "Service Unavailable");
    const path = new URL(request.url ?? "/", "http://gateway").pathname;
    if (path !== "/ws/class") return rejectUpgrade(socket, 404, "Not Found");
    const origin = request.headers.origin;
    if (!origin || !allowedOrigins.has(origin)) return rejectUpgrade(socket, 403, "Forbidden");

    const user = await authenticateRealtimeRequest(request.headers.cookie);
    if (!user) return rejectUpgrade(socket, 401, "Unauthorized");
    if (user.role !== "student") return rejectUpgrade(socket, 403, "Forbidden");
    if (socket.destroyed) return;

    wss.handleUpgrade(request, socket, head, (webSocket) => {
      const connectionId = randomUUID();
      const now = Date.now();
      const connection: RealtimeConnection = {
        connectionId,
        userId: user.id,
        role: user.role,
        socket: webSocket,
        connectedAt: now,
        lastSeenAt: now,
      };
      registry.add(connection);

      let joined = false;
      let joinedSession: ClassSessionDTO | undefined;
      let sideband: OpenAISideband | undefined;
      let voiceTurn: VoiceTurnState | undefined;
      const seenTranscriptItems = new Set<string>();
      let protocolViolations = 0;
      let rateWindowStartedAt = now;
      let rateMessageCount = 0;
      let missedPongs = 0;
      const transientOrbTimers = new Set<ReturnType<typeof setTimeout>>();

      console.info("event=connection.open", `connectionId=${connectionId}`, `userId=${user.id}`);
      send(webSocket, { type: "connection.ready", connectionId, serverTime: now });
      send(webSocket, { type: "orb.state", state: "thinking", reason: "connecting" });

      const joinTimer = setTimeout(() => {
        if (joined) return;
        send(webSocket, { type: "error", code: "JOIN_TIMEOUT", message: "Class join timed out", retryable: true });
        webSocket.close(4408, "Join timeout");
      }, JOIN_TIMEOUT_MS);

      const violate = (code: string, requestId?: string): void => {
        protocolViolations += 1;
        console.warn("event=protocol.error", `connectionId=${connectionId}`, `errorCode=${code}`);
        send(webSocket, { type: "error", code, message: "Invalid socket message", retryable: false, requestId });
        if (protocolViolations >= MAX_PROTOCOL_VIOLATIONS) webSocket.close(4400, "Protocol violation");
      };

      const clearTransientOrbTimers = (): void => {
        for (const timer of transientOrbTimers) clearTimeout(timer);
        transientOrbTimers.clear();
      };

      const sendTransientOrbState = (state: "success" | "error", delay: number): void => {
        send(webSocket, { type: "orb.state", state });
        const timer = setTimeout(() => {
          transientOrbTimers.delete(timer);
          send(webSocket, { type: "orb.state", state: "idle" });
        }, delay);
        transientOrbTimers.add(timer);
      };

      const closeVoice = (): void => {
        sideband?.close();
        sideband = undefined;
        voiceTurn = undefined;
      };
      connection.closeVoice = closeVoice;

      const failActiveVoiceTurn = async (message: string): Promise<void> => {
        const current = voiceTurn;
        voiceTurn = undefined;
        if (current && joinedSession) {
          await failTeacherTurn({
            sessionId: joinedSession.id,
            submissionKey: current.submissionKey,
            errorCode: "reply_unavailable",
          }).catch(() => undefined);
        }
        send(webSocket, {
          type: "teacher.turn.failed",
          turnId: current?.turnId,
          message: "The teacher is unavailable. Please retry.",
          retryable: true,
        });
        console.warn("event=voice.turn.failed", `connectionId=${connectionId}`, `reason=${message}`);
        sendTransientOrbState("error", 1200);
      };

      const handleStudentTranscript = async (itemId: string, transcript: string): Promise<void> => {
        if (!joinedSession || !connection.callId) return;
        const dedupeKey = `${connection.callId}:${itemId}`;
        if (seenTranscriptItems.has(dedupeKey)) return;
        seenTranscriptItems.add(dedupeKey);
        if (!transcript.trim() || voiceTurn) return;

        const submissionKey = `voice:${connection.callId}:${itemId}`;
        try {
          const existingTurns = await listClassTurns(joinedSession.id);
          const prepared = await prepareTeacherTurn({
            session: joinedSession,
            userId: user.id,
            studentMessage: transcript,
            submissionKey,
            index: existingTurns.length,
            inputMode: "voice",
          });
          if (prepared.alreadyCompleted) {
            send(webSocket, { type: "student.transcript.final", turnId: prepared.turn.id, transcript });
            if (prepared.turn.aiMessage) {
              send(webSocket, { type: "teacher.reply.done", turnId: prepared.turn.id, text: prepared.turn.aiMessage });
              sendTransientOrbState("success", 700);
            }
            return;
          }
          if (!prepared.approvedPlan) return;

          const instructions = buildRealtimeReplyInstructions({
            level: joinedSession.level,
            subject: joinedSession.subject ?? "",
            studentMessage: transcript,
            recentTurns: prepared.recentTurns,
            approvedPlan: prepared.approvedPlan,
          });
          voiceTurn = {
            turnId: prepared.turn.id,
            submissionKey,
            approvedPlan: prepared.approvedPlan,
            recentTurns: prepared.recentTurns,
            instructions,
            studentTranscript: transcript,
            teacherTranscript: "",
            startedAt: Date.now(),
            plannerLogId: prepared.plannerLogId,
          };

          send(webSocket, { type: "student.transcript.final", turnId: prepared.turn.id, transcript });
          send(webSocket, { type: "orb.state", state: "thinking" });

          const started = sideband?.createTeacherResponse({ turnId: prepared.turn.id, instructions });
          if (!started) await failActiveVoiceTurn("could not start response");
        } catch {
          voiceTurn = undefined;
          await failTeacherTurn({ sessionId: joinedSession.id, submissionKey, errorCode: "planner_unavailable" }).catch(
            () => undefined,
          );
          send(webSocket, { type: "teacher.turn.failed", message: "The teacher is unavailable. Please retry.", retryable: true });
          sendTransientOrbState("error", 1200);
        }
      };

      const handleResponseDone = async (
        responseId: string | undefined,
        transcript: string,
        usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined,
      ): Promise<void> => {
        const current = voiceTurn;
        voiceTurn = undefined;
        if (!current || !joinedSession) return;
        const finalReply = (transcript || current.teacherTranscript).trim();
        if (!finalReply) {
          await failActiveVoiceTurnFor(current, "empty reply");
          return;
        }

        const replyLogId = await logAICall({
          provider: "openai",
          model: env.aiRealtimeModel,
          operation: "realtime",
          prompt: realtimeReplyPromptIdentity,
          messages: [
            { role: "system", content: current.instructions },
            { role: "assistant", content: finalReply },
          ],
          response: finalReply,
          parsedOk: true,
          repairAttempted: false,
          latencyMs: Date.now() - current.startedAt,
          usage,
          context: { userId: user.id, sessionId: joinedSession.id, turnId: current.turnId },
        });

        try {
          await finalizeTeacherTurn({
            session: joinedSession,
            userId: user.id,
            submissionKey: current.submissionKey,
            approvedPlan: current.approvedPlan,
            studentMessage: current.studentTranscript,
            finalReply,
            plannerLogId: current.plannerLogId,
            replyLogId,
            inputMode: "voice",
            transcription: {
              provider: "openai",
              model: env.aiTranscriptionModel,
              transcript: current.studentTranscript,
              completedAt: new Date(),
            },
            realtimeResponseId: responseId,
          });
        } catch {
          send(webSocket, { type: "teacher.turn.failed", turnId: current.turnId, message: "Could not save the reply.", retryable: true });
          sendTransientOrbState("error", 1200);
          return;
        }

        send(webSocket, { type: "teacher.reply.done", turnId: current.turnId, text: finalReply });
        sendTransientOrbState("success", 700);
      };

      const failActiveVoiceTurnFor = async (current: VoiceTurnState, message: string): Promise<void> => {
        if (joinedSession) {
          await failTeacherTurn({ sessionId: joinedSession.id, submissionKey: current.submissionKey, errorCode: "reply_unavailable" }).catch(
            () => undefined,
          );
        }
        send(webSocket, { type: "teacher.turn.failed", turnId: current.turnId, message: "The teacher is unavailable. Please retry.", retryable: true });
        console.warn("event=voice.turn.failed", `connectionId=${connectionId}`, `reason=${message}`);
        sendTransientOrbState("error", 1200);
      };

      const handleVoiceAttach = (event: { requestId: string; callId: string; attachToken: string }): void => {
        if (!joined || !joinedSession) return violate("CLASS_NOT_JOINED", event.requestId);
        if (connection.callId) {
          send(webSocket, { type: "error", code: "VOICE_ALREADY_ATTACHED", message: "Voice already attached", retryable: false, requestId: event.requestId });
          return;
        }
        const payload = verifyRealtimeAttachToken(event.attachToken);
        if (
          !payload ||
          payload.callId !== event.callId ||
          payload.userId !== user.id ||
          payload.sessionId !== joinedSession.id
        ) {
          send(webSocket, { type: "error", code: "VOICE_ATTACH_REJECTED", message: "Attachment rejected", retryable: false, requestId: event.requestId });
          return;
        }

        connection.callId = event.callId;
        const sb = new OpenAISideband({
          callId: event.callId,
          apiKey: env.openaiApiKey,
          callbacks: {
            onInputTranscriptionCompleted: ({ itemId, transcript }) => {
              void handleStudentTranscript(itemId, transcript);
            },
            onOutputTranscriptDelta: ({ text }) => {
              if (!voiceTurn) return;
              voiceTurn.teacherTranscript += text;
              send(webSocket, { type: "teacher.reply.delta", turnId: voiceTurn.turnId, text });
              send(webSocket, { type: "orb.state", state: "speaking" });
            },
            onResponseDone: ({ responseId, transcript, usage }) => {
              void handleResponseDone(responseId, transcript, usage);
            },
            onError: ({ message }) => {
              void failActiveVoiceTurn(message);
            },
          },
        });
        sideband = sb;
        sb.connect();
        send(webSocket, { type: "voice.session.ready", requestId: event.requestId });
        console.info("event=voice.session.ready", `connectionId=${connectionId}`);
      };

      webSocket.on("message", async (raw: RawData, isBinary: boolean) => {
        const currentTime = Date.now();
        connection.lastSeenAt = currentTime;

        if (currentTime - rateWindowStartedAt >= RATE_WINDOW_MS) {
          rateWindowStartedAt = currentTime;
          rateMessageCount = 0;
        }
        rateMessageCount += 1;
        if (rateMessageCount > RATE_MAX_MESSAGES) {
          send(webSocket, { type: "error", code: "RATE_LIMITED", message: "Too many messages", retryable: true });
          webSocket.close(4429, "Rate limited");
          return;
        }
        if (isBinary) return violate("BINARY_UNSUPPORTED");

        const parsed = parseClientRealtimeEvent(raw.toString());
        if (!parsed.success) return violate(parsed.error.code);

        if (parsed.data.type === "heartbeat") {
          send(webSocket, { type: "heartbeat.ack", sentAt: parsed.data.sentAt, serverTime: currentTime });
          return;
        }
        if (parsed.data.type !== "class.join") {
          if (!joined) return violate("CLASS_NOT_JOINED", parsed.data.requestId);
          const event = parsed.data;
          if (event.type === "voice.session.attach") {
            handleVoiceAttach(event);
            return;
          }
          clearTransientOrbTimers();
          if (event.type === "voice.capture.started") {
            send(webSocket, { type: "orb.state", state: "listening" });
          } else if (event.type === "voice.capture.stopped") {
            send(webSocket, { type: "orb.state", state: "thinking" });
          } else if (event.type === "voice.capture.cancelled") {
            send(webSocket, { type: "orb.state", state: "idle" });
          }
          return;
        }
        if (joined) return violate("ALREADY_JOINED", parsed.data.requestId);

        try {
          const session = await getClassByIdForUser(parsed.data.sessionId, user.id);
          if (!session || session.status !== "active") {
            send(webSocket, { type: "error", code: "CLASS_UNAVAILABLE", message: "Class is unavailable", retryable: false, requestId: parsed.data.requestId });
            webSocket.close(4403, "Class unavailable");
            return;
          }

          joined = true;
          joinedSession = session;
          clearTimeout(joinTimer);
          const replaced = registry.bindSession(connectionId, user.id, session.id);
          if (replaced) {
            replaced.closeVoice?.();
            send(replaced.socket, { type: "session.replaced", message: "This class was opened elsewhere" });
            replaced.socket.close(4001, "Session replaced");
          }
          send(webSocket, {
            type: "class.ready",
            requestId: parsed.data.requestId,
            sessionId: session.id,
            subject: session.subject ?? "Speaking class",
            level: session.level,
            turnCount: session.turnCount,
          });
          send(webSocket, { type: "orb.state", state: "idle" });
          console.info("event=class.join", `connectionId=${connectionId}`, `sessionId=${session.id}`);
        } catch {
          send(webSocket, { type: "error", code: "CLASS_LOOKUP_FAILED", message: "Class could not be loaded", retryable: true, requestId: parsed.data.requestId });
        }
      });

      webSocket.on("pong", () => {
        missedPongs = 0;
        connection.lastSeenAt = Date.now();
      });

      const heartbeatTimer = setInterval(() => {
        if (missedPongs >= 2) {
          webSocket.terminate();
          return;
        }
        missedPongs += 1;
        webSocket.ping();
      }, HEARTBEAT_INTERVAL_MS);

      webSocket.on("close", () => {
        clearTimeout(joinTimer);
        clearInterval(heartbeatTimer);
        clearTransientOrbTimers();
        closeVoice();
        registry.remove(connectionId);
        console.info("event=connection.close", `connectionId=${connectionId}`);
      });

      webSocket.on("error", () => {
        console.warn("event=connection.error", `connectionId=${connectionId}`, "errorCode=SOCKET_ERROR");
      });
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info("event=gateway.shutdown", `signal=${signal}`);
    for (const socket of wss.clients) send(socket, { type: "orb.state", state: "paused", reason: "shutdown" });
    registry.closeAll();
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM").finally(() => process.exit(0)));
  process.once("SIGINT", () => void shutdown("SIGINT").finally(() => process.exit(0)));

  server.listen(env.realtimePort, () => {
    console.info("event=gateway.ready", `port=${env.realtimePort}`);
  });
}

main().catch(() => {
  console.error("event=gateway.failed", "errorCode=STARTUP_FAILED");
  process.exit(1);
});
