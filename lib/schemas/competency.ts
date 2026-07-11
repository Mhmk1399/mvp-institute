import { z } from "zod";

/** Shared enums + validation for the competency engine. */

export const competencyDomainSchema = z.enum([
  "grammar",
  "vocabulary",
  "function",
  "communication",
  "speaking",
  "listening",
  "pronunciation",
  "reading",
  "writing",
]);

export const competencySourceTypeSchema = z.enum([
  "placement",
  "class",
  "conversation",
  "roleplay",
  "writing",
  "teacher-review",
]);

export const competencyResultSchema = z.enum(["positive", "negative", "insufficient"]);
export const competencyIndependenceSchema = z.enum(["spontaneous", "prompted", "imitated"]);
export const competencyStatusSchema = z.enum(["not-demonstrated", "developing", "mastered"]);

export const competencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{2,4}-(A1|A2|B1|B2|C1|C2)-\d{3}$/, "Invalid competency code");

const cefrSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");

function noCaseInsensitiveDuplicates(items: string[]): boolean {
  return new Set(items.map((item) => item.toLowerCase())).size === items.length;
}

/** Trim, drop blanks, enforce per-item length, reject case-insensitive dupes. */
function entryList(max = 500) {
  return z
    .array(z.string())
    .transform((items) => items.map((item) => item.trim()).filter(Boolean))
    .pipe(
      z
        .array(z.string().min(1).max(max))
        .refine(noCaseInsensitiveDuplicates, "Duplicate entries are not allowed"),
    );
}

const prerequisiteList = z
  .array(z.string())
  .transform((items) => items.map((item) => item.trim().toUpperCase()).filter(Boolean))
  .pipe(
    z
      .array(competencyCodeSchema)
      .refine(noCaseInsensitiveDuplicates, "Duplicate prerequisites are not allowed"),
  );

export const createCompetencyDefinitionSchema = z
  .object({
    code: competencyCodeSchema,
    domain: competencyDomainSchema,
    level: cefrSchema,
    name: z.string().trim().min(2).max(150),
    description: z.string().trim().min(1).max(1500),
    performanceDescriptor: z.string().trim().min(1).max(1500),
    evidenceRequired: z.number().int().min(1).max(20).default(5),
    accuracyThreshold: z.number().min(0).max(1).default(0.8),
    contextsRequired: z.number().int().min(1).max(10).default(2),
    confidenceThreshold: z.number().min(0).max(1).default(0.75),
    positivePatterns: entryList().default([]),
    negativePatterns: entryList().default([]),
    exceptions: entryList().default([]),
    prerequisites: prerequisiteList.default([]),
    isCritical: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .strict();

// Code + audit fields are never accepted from update input.
export const updateCompetencyDefinitionSchema = createCompetencyDefinitionSchema
  .omit({ code: true })
  .strict();

export const createCompetencyObservationSchema = z
  .object({
    observationKey: z.string().trim().min(8).max(250),
    userId: objectIdSchema,
    competencyCode: competencyCodeSchema,
    sourceType: competencySourceTypeSchema,
    sourceSessionId: objectIdSchema.optional(),
    sourceTurnId: objectIdSchema.optional(),
    contextKey: z.string().trim().min(1).max(200),
    result: competencyResultSchema,
    accuracy: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    independence: competencyIndependenceSchema,
    evidenceExcerpt: z.string().trim().min(1).max(1500),
    aiCallId: objectIdSchema.optional(),
  })
  .strict();

export type CompetencyDomain = z.infer<typeof competencyDomainSchema>;
export type CompetencySourceType = z.infer<typeof competencySourceTypeSchema>;
export type CompetencyResult = z.infer<typeof competencyResultSchema>;
export type CompetencyIndependence = z.infer<typeof competencyIndependenceSchema>;
export type CompetencyStatus = z.infer<typeof competencyStatusSchema>;
export type CreateCompetencyDefinitionInput = z.infer<typeof createCompetencyDefinitionSchema>;
export type UpdateCompetencyDefinitionInput = z.infer<typeof updateCompetencyDefinitionSchema>;
export type CreateCompetencyObservationInput = z.infer<typeof createCompetencyObservationSchema>;
