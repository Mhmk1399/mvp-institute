import { z } from "zod";

/**
 * Provider-neutral Zod schemas shared across the AI layer. Domain-specific
 * shapes (exam, class, scoring) live with their versioned prompt, not here.
 */

export const aiRoleSchema = z.enum(["system", "user", "assistant"]);

export const aiMessageSchema = z.object({
  role: aiRoleSchema,
  content: z.string(),
});

export const aiUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
});

/** IDs are strings at the AI boundary; the log model casts them to ObjectId. */
export const aiCallContextSchema = z.object({
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  turnId: z.string().optional(),
});

/** Minimal structured shape used only by the smoke test. */
export const smokeResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});

export type AIRole = z.infer<typeof aiRoleSchema>;
export type AIMessage = z.infer<typeof aiMessageSchema>;
export type AIUsage = z.infer<typeof aiUsageSchema>;
export type AICallContext = z.infer<typeof aiCallContextSchema>;
export type SmokeResult = z.infer<typeof smokeResultSchema>;
