import { z } from "zod";

/** Zod schemas for the placement-exam server actions. */

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid identifier");

// Start takes no client input; audit/ability fields are never accepted.
export const startExamSchema = z.object({}).strict();

export const submitExamAnswerSchema = z
  .object({
    sessionId: objectIdSchema,
    turnId: objectIdSchema,
    submissionKey: z.string().trim().min(8).max(100),
    answer: z.string().trim().min(1, "An answer is required").max(5000),
  })
  .strict();

export type StartExamInput = z.infer<typeof startExamSchema>;
export type SubmitExamAnswerInput = z.infer<typeof submitExamAnswerSchema>;
