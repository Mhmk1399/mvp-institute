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
import { RealtimeConnectionRegistry } from "@/lib/realtime/registry";

loadEnvConfig(process.cwd());

const JOIN_TIMEOUT_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 25_000;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_MESSAGES = 30;
const MAX_PROTOCOL_VIOLATIONS = 3;

function rejectUpgrade(socket: import("node:stream").Duplex, status: number, message: string): void {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

function send(socket: WebSocket, event: ServerRealtimeEvent): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(serializeServerRealtimeEvent(event));
}

async function main(): Promise<void> {
  const [{ env }, { authenticateRealtimeRequest }, { getClassByIdForUser }] = await Promise.all([
    import("@/lib/env"),
    import("@/lib/realtime/auth"),
    import("@/lib/services/class"),
  ]);
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

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 16 * 1024,
    perMessageDeflate: false,
  });

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
      registry.add({
        connectionId,
        userId: user.id,
        role: user.role,
        socket: webSocket,
        connectedAt: now,
        lastSeenAt: now,
      });

      let joined = false;
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
        send(webSocket, {
          type: "error",
          code: "JOIN_TIMEOUT",
          message: "Class join timed out",
          retryable: true,
        });
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

      webSocket.on("message", async (raw: RawData, isBinary: boolean) => {
        const currentTime = Date.now();
        const connection = registry.remove(connectionId);
        if (connection) {
          connection.lastSeenAt = currentTime;
          registry.add(connection);
        }

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
          clearTransientOrbTimers();
          if (parsed.data.type === "voice.capture.started") {
            send(webSocket, { type: "orb.state", state: "listening" });
          } else if (
            parsed.data.type === "voice.capture.stopped" ||
            parsed.data.type === "voice.transcript.completed"
          ) {
            send(webSocket, { type: "orb.state", state: "thinking" });
          } else if (parsed.data.type === "voice.capture.cancelled") {
            send(webSocket, { type: "orb.state", state: "idle" });
          } else if (parsed.data.type === "voice.turn.completed") {
            sendTransientOrbState("success", 700);
          } else if (parsed.data.type === "voice.turn.failed") {
            sendTransientOrbState("error", 1200);
          }
          return;
        }
        if (joined) return violate("ALREADY_JOINED", parsed.data.requestId);

        try {
          const session = await getClassByIdForUser(parsed.data.sessionId, user.id);
          if (!session || session.status !== "active") {
            send(webSocket, {
              type: "error",
              code: "CLASS_UNAVAILABLE",
              message: "Class is unavailable",
              retryable: false,
              requestId: parsed.data.requestId,
            });
            webSocket.close(4403, "Class unavailable");
            return;
          }

          joined = true;
          clearTimeout(joinTimer);
          const replaced = registry.bindSession(connectionId, user.id, session.id);
          if (replaced) {
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
          send(webSocket, {
            type: "error",
            code: "CLASS_LOOKUP_FAILED",
            message: "Class could not be loaded",
            retryable: true,
            requestId: parsed.data.requestId,
          });
        }
      });

      webSocket.on("pong", () => {
        missedPongs = 0;
        const connection = registry.remove(connectionId);
        if (connection) {
          connection.lastSeenAt = Date.now();
          registry.add(connection);
        }
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
