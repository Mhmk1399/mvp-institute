import "server-only";

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const DOMAINS = [
  "grammar",
  "vocabulary",
  "function",
  "communication",
  "speaking",
  "listening",
  "pronunciation",
  "reading",
  "writing",
] as const;
const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

function noDuplicateEntries(values: string[]): boolean {
  const seen = values.map((value) => value.trim().toLowerCase());
  return new Set(seen).size === seen.length;
}

const dedupedStringArray = {
  type: [{ type: String, trim: true }],
  default: [] as string[],
  validate: {
    validator: noDuplicateEntries,
    message: "Entries must be unique (case-insensitive)",
  },
};

/**
 * A competency definition (curriculum-level). Immutable code, no learner state.
 */
const competencyDefinitionSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, immutable: true, uppercase: true, trim: true },
    domain: { type: String, enum: DOMAINS, required: true },
    level: { type: String, enum: CEFR, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    performanceDescriptor: { type: String, required: true, trim: true },
    evidenceRequired: { type: Number, min: 1, max: 20, default: 5, required: true },
    accuracyThreshold: { type: Number, min: 0, max: 1, default: 0.8, required: true },
    contextsRequired: { type: Number, min: 1, max: 10, default: 2, required: true },
    confidenceThreshold: { type: Number, min: 0, max: 1, default: 0.75, required: true },
    positivePatterns: dedupedStringArray,
    negativePatterns: dedupedStringArray,
    exceptions: dedupedStringArray,
    prerequisites: {
      type: [{ type: String, trim: true, uppercase: true }],
      default: [] as string[],
      validate: [
        { validator: noDuplicateEntries, message: "Prerequisites must be unique" },
        {
          validator: function (this: { code?: string }, values: string[]): boolean {
            const own = (this.code ?? "").toUpperCase();
            return !values.some((value) => value.toUpperCase() === own);
          },
          message: "A competency cannot list itself as a prerequisite",
        },
      ],
    },
    isCritical: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

competencyDefinitionSchema.index({ code: 1 }, { unique: true });
competencyDefinitionSchema.index({ level: 1, domain: 1, isActive: 1 });
competencyDefinitionSchema.index({ prerequisites: 1 });

export type CompetencyDefinitionDoc = InferSchemaType<typeof competencyDefinitionSchema> & {
  _id: mongoose.Types.ObjectId;
};

/** Guard against Mongoose recompiling the model on hot-reload. */
export const CompetencyDefinition: Model<CompetencyDefinitionDoc> =
  (mongoose.models.CompetencyDefinition as Model<CompetencyDefinitionDoc>) ??
  mongoose.model<CompetencyDefinitionDoc>("CompetencyDefinition", competencyDefinitionSchema);
