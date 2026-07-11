import "server-only";

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Deterministic aggregated state for one student + competency. Only the
 * competency aggregation service writes here — never AI, never clients. No CEFR
 * field lives here (User.cefrLevel is unchanged for compatibility).
 */
const learnerCompetencySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    competencyCode: { type: String, required: true },
    evidenceCount: { type: Number, default: 0, required: true },
    positiveEvidenceCount: { type: Number, default: 0, required: true },
    negativeEvidenceCount: { type: Number, default: 0, required: true },
    insufficientEvidenceCount: { type: Number, default: 0, required: true },
    distinctContextCount: { type: Number, default: 0, required: true },
    weightedAccuracy: { type: Number, min: 0, max: 1, default: 0, required: true },
    confidence: { type: Number, min: 0, max: 1, default: 0, required: true },
    criticalContradictionCount: { type: Number, default: 0, required: true },
    status: {
      type: String,
      enum: ["not-demonstrated", "developing", "mastered"],
      default: "not-demonstrated",
      required: true,
    },
    lastObservedAt: { type: Date },
    version: { type: Number, default: 1, required: true },
  },
  { timestamps: true },
);

learnerCompetencySchema.index({ userId: 1, competencyCode: 1 }, { unique: true });
learnerCompetencySchema.index({ userId: 1, status: 1 });
learnerCompetencySchema.index({ competencyCode: 1, status: 1 });
learnerCompetencySchema.index({ userId: 1, updatedAt: -1 });

export type LearnerCompetencyDoc = InferSchemaType<typeof learnerCompetencySchema> & {
  _id: mongoose.Types.ObjectId;
};

/** Guard against Mongoose recompiling the model on hot-reload. */
export const LearnerCompetency: Model<LearnerCompetencyDoc> =
  (mongoose.models.LearnerCompetency as Model<LearnerCompetencyDoc>) ??
  mongoose.model<LearnerCompetencyDoc>("LearnerCompetency", learnerCompetencySchema);
