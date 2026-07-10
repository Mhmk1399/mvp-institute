import { z } from "zod";

import { CEFR_CODES } from "@/lib/models/level";

export const cefrCodeSchema = z.enum(CEFR_CODES);

/** Trim, drop blanks, enforce per-item length, require ≥1, reject dup (i-case). */
const entryListSchema = z
  .array(z.string())
  .transform((items) => items.map((item) => item.trim()).filter(Boolean))
  .pipe(
    z
      .array(z.string().min(1).max(300))
      .min(1, "At least one entry is required")
      .refine(
        (items) =>
          new Set(items.map((item) => item.toLowerCase())).size === items.length,
        "Entries must be unique",
      ),
  );

export const levelInputSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80, "Name is too long"),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(1000, "Description is too long"),
  goals: z.object({
    grammar: entryListSchema,
    vocabulary: entryListSchema,
    functions: entryListSchema,
  }),
  canDoStatements: entryListSchema,
  passThreshold: z
    .number()
    .min(0, "Threshold must be between 0 and 1")
    .max(1, "Threshold must be between 0 and 1"),
  isActive: z.boolean(),
});

export const createLevelSchema = levelInputSchema.extend({
  code: cefrCodeSchema,
});

// Audit fields (code, createdBy, updatedBy) are never accepted from the client.
export const updateLevelSchema = levelInputSchema;

export type CEFRCodeInput = z.infer<typeof cefrCodeSchema>;
export type LevelInput = z.infer<typeof levelInputSchema>;
export type CreateLevelInput = z.infer<typeof createLevelSchema>;
export type UpdateLevelInput = z.infer<typeof updateLevelSchema>;
