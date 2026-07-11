import { z } from "zod";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid session ID");
const requestIdSchema = z.string().min(8).max(100);
const cefrSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
const orbStateSchema = z.enum([
  "idle",
  "listening",
  "thinking",
  "speaking",
  "success",
  "error",
  "paused",
]);

export const clientRealtimeEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("class.join"),
    requestId: requestIdSchema,
    sessionId: objectIdSchema,
  }).strict(),
  z.object({
    type: z.literal("heartbeat"),
    sentAt: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    type: z.literal("voice.capture.started"),
    requestId: requestIdSchema,
  }).strict(),
  z.object({
    type: z.literal("voice.capture.stopped"),
    requestId: requestIdSchema,
  }).strict(),
  z.object({
    type: z.literal("voice.capture.cancelled"),
    requestId: requestIdSchema,
  }).strict(),
  z.object({
    type: z.literal("voice.transcript.completed"),
    requestId: requestIdSchema,
  }).strict(),
  z.object({
    type: z.literal("voice.turn.completed"),
    requestId: requestIdSchema,
  }).strict(),
  z.object({
    type: z.literal("voice.turn.failed"),
    requestId: requestIdSchema,
  }).strict(),
]);

export const serverRealtimeEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("connection.ready"),
    connectionId: z.string().uuid(),
    serverTime: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    type: z.literal("class.ready"),
    requestId: requestIdSchema,
    sessionId: objectIdSchema,
    subject: z.string().min(1),
    level: cefrSchema,
    turnCount: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    type: z.literal("orb.state"),
    state: orbStateSchema,
    reason: z.string().optional(),
  }).strict(),
  z.object({
    type: z.literal("heartbeat.ack"),
    sentAt: z.number().int().nonnegative(),
    serverTime: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    type: z.literal("session.replaced"),
    message: z.string(),
  }).strict(),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    requestId: requestIdSchema.optional(),
  }).strict(),
]);

export type ClientRealtimeEvent = z.infer<typeof clientRealtimeEventSchema>;
export type ServerRealtimeEvent = z.infer<typeof serverRealtimeEventSchema>;
export type OrbState = z.infer<typeof orbStateSchema>;

export function parseClientRealtimeEvent(raw: string) {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { success: false as const, error: { code: "INVALID_JSON", message: "Invalid message" } };
  }
  const parsed = clientRealtimeEventSchema.safeParse(value);
  return parsed.success
    ? { success: true as const, data: parsed.data }
    : { success: false as const, error: { code: "INVALID_EVENT", message: "Invalid message" } };
}

export function serializeServerRealtimeEvent(event: ServerRealtimeEvent): string {
  return JSON.stringify(serverRealtimeEventSchema.parse(event));
}
