import "server-only";

import mongoose from "mongoose";

import { connectToDatabase } from "@/lib/db/mongoose";
import { AICallLog } from "@/lib/models/ai-call-log";
import type {
  AICallContext,
  AIMessage,
  AIUsage,
  PromptIdentity,
} from "@/lib/ai/types";

const REDACTED = "[REDACTED]";

/** Case-insensitive substring match against any of these marks a key secret. */
const SENSITIVE_KEYS = [
  "password",
  "passwordhash",
  "authorization",
  "cookie",
  "set-cookie",
  "apikey",
  "api_key",
  "openai_api_key",
  "auth_secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((needle) => lower.includes(needle));
}

/** Redact bearer/API-key-like substrings that appear inside free text. */
function redactText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/\-]+=*/gi, `Bearer ${REDACTED}`)
    .replace(/\bsk-[A-Za-z0-9._\-]{8,}/g, REDACTED);
}

/** Recursively redact sensitive keys and token-like strings. Shape-preserving. */
export function redact<T>(value: T): T {
  if (typeof value === "string") return redactText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => redact(item)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redact(val);
    }
    return out as T;
  }
  return value;
}

function toObjectId(id?: string): mongoose.Types.ObjectId | undefined {
  return id && mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : undefined;
}

function toContext(context?: AICallContext) {
  if (!context) return undefined;
  const userId = toObjectId(context.userId);
  const sessionId = toObjectId(context.sessionId);
  const turnId = toObjectId(context.turnId);
  if (!userId && !sessionId && !turnId) return undefined;
  return { userId, sessionId, turnId };
}

export interface AICallLogInput {
  provider: string;
  model: string;
  operation: "chat" | "chatJSON";
  prompt?: PromptIdentity;
  messages: AIMessage[];
  response?: string;
  parsedResponse?: unknown;
  parsedOk: boolean;
  repairAttempted: boolean;
  latencyMs: number;
  usage?: AIUsage;
  context?: AICallContext;
  error?: { name?: string; message?: string; code?: string };
}

/**
 * Persist one redacted AICallLog for a successful or failed call. Logging is
 * best-effort: on failure it logs a concise server-side message and returns
 * undefined, so the caller's original AI/parse error is never masked.
 */
export async function logAICall(input: AICallLogInput): Promise<string | undefined> {
  try {
    await connectToDatabase();
    const doc = await AICallLog.create({
      provider: input.provider,
      model: input.model,
      operation: input.operation,
      promptTemplateId: input.prompt?.id,
      promptVersion: input.prompt?.version,
      messages: redact(input.messages),
      response: input.response === undefined ? undefined : redactText(input.response),
      parsedResponse:
        input.parsedResponse === undefined ? undefined : redact(input.parsedResponse),
      parsedOk: input.parsedOk,
      repairAttempted: input.repairAttempted,
      latencyMs: input.latencyMs,
      inputTokens: input.usage?.inputTokens,
      outputTokens: input.usage?.outputTokens,
      totalTokens: input.usage?.totalTokens,
      context: toContext(input.context),
      error: input.error ? redact(input.error) : undefined,
    });
    return String(doc._id);
  } catch (logError) {
    const message = logError instanceof Error ? logError.message : String(logError);
    console.error(`[ai] failed to persist AICallLog: ${message}`);
    return undefined;
  }
}
