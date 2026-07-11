import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

/**
 * Short-lived, signed attachment token that lets a browser bind its OpenAI
 * Realtime call to the class socket. HMAC-SHA256 over AUTH_SECRET — deliberately
 * NOT the login cookie. Never throws raw parse errors.
 */
const PURPOSE = "realtime-class-attach" as const;
const TTL_SECONDS = 60;

export interface RealtimeAttachPayload {
  purpose: typeof PURPOSE;
  userId: string;
  sessionId: string;
  callId: string;
  exp: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(encoded: string): string {
  return base64url(createHmac("sha256", env.authSecret).update(encoded).digest());
}

export function createRealtimeAttachToken(payload: {
  userId: string;
  sessionId: string;
  callId: string;
}): string {
  const body: RealtimeAttachPayload = {
    purpose: PURPOSE,
    userId: payload.userId,
    sessionId: payload.sessionId,
    callId: payload.callId,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  const encoded = base64url(JSON.stringify(body));
  return `${encoded}.${sign(encoded)}`;
}

export function verifyRealtimeAttachToken(token: string): RealtimeAttachPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [encoded, signature] = parts;

    const expected = sign(encoded);
    const provided = Buffer.from(signature);
    const wanted = Buffer.from(expected);
    if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) {
      return null;
    }

    const raw: unknown = JSON.parse(
      Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    if (!raw || typeof raw !== "object") return null;
    const value = raw as Record<string, unknown>;
    if (
      value.purpose !== PURPOSE ||
      typeof value.userId !== "string" ||
      typeof value.sessionId !== "string" ||
      typeof value.callId !== "string" ||
      typeof value.exp !== "number"
    ) {
      return null;
    }
    if (value.exp < Math.floor(Date.now() / 1000)) return null;

    return {
      purpose: PURPOSE,
      userId: value.userId,
      sessionId: value.sessionId,
      callId: value.callId,
      exp: value.exp,
    };
  } catch {
    return null;
  }
}
