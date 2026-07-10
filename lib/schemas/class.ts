import { z } from "zod";

/** Zod schemas for the speaking-class server actions and chat route. */

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");

export const selectSubjectSchema = z
  .object({
    sessionId: objectIdSchema,
    subjectTitle: z.string().trim().min(1).max(200),
  })
  .strict();

export const classMessageSchema = z
  .object({
    sessionId: objectIdSchema,
    message: z.string().trim().min(1, "A message is required").max(4000),
    submissionKey: z.string().trim().min(8).max(100),
  })
  .strict();

export const completeClassSchema = z
  .object({
    sessionId: objectIdSchema,
  })
  .strict();

export type SelectSubjectInput = z.infer<typeof selectSubjectSchema>;
export type ClassMessageInput = z.infer<typeof classMessageSchema>;
export type CompleteClassInput = z.infer<typeof completeClassSchema>;
