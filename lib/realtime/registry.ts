import type { WebSocket } from "ws";

export interface RealtimeConnection {
  connectionId: string;
  userId: string;
  role: "student" | "teacher" | "admin";
  socket: WebSocket;
  connectedAt: number;
  lastSeenAt: number;
  sessionId?: string;
  callId?: string;
  /** Closes the OpenAI sideband bound to this connection, if any. */
  closeVoice?: () => void;
}

export class RealtimeConnectionRegistry {
  private readonly connections = new Map<string, RealtimeConnection>();

  add(connection: RealtimeConnection): void {
    this.connections.set(connection.connectionId, connection);
  }

  remove(connectionId: string): RealtimeConnection | undefined {
    const connection = this.connections.get(connectionId);
    this.connections.delete(connectionId);
    return connection;
  }

  bindSession(
    connectionId: string,
    userId: string,
    sessionId: string,
  ): RealtimeConnection | undefined {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.userId !== userId) return undefined;
    const replaced = this.findByUserAndSession(userId, sessionId);
    connection.sessionId = sessionId;
    return replaced?.connectionId === connectionId ? undefined : replaced;
  }

  findByUserAndSession(userId: string, sessionId: string): RealtimeConnection | undefined {
    return [...this.connections.values()].find(
      (connection) => connection.userId === userId && connection.sessionId === sessionId,
    );
  }

  count(): number {
    return this.connections.size;
  }

  closeAll(): void {
    for (const connection of this.connections.values()) {
      connection.closeVoice?.();
      connection.socket.close(1001, "Gateway shutdown");
    }
    this.connections.clear();
  }
}
