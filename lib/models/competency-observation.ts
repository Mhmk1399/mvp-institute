import "server-only";

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * One immutable evidence item. Append-only: no update/delete. Stores a compact
 * grounded excerpt only — never raw audio or full prompt/response content.
 */
const competencyObservationSchema = new Schema(
  {
    observationKey: { type: String, required: true, unique: true, immutable: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    competencyCode: { type: String, required: true },
    sourceType: {
      type: String,
      enum: ["placement", "class", "conversation", "roleplay", "writing", "teacher-review"],
      required: true,
    },
    sourceSessionId: { type: Schema.Types.ObjectId },
    sourceTurnId: { type: Schema.Types.ObjectId },
    contextKey: { type: String, required: true },
    result: { type: String, enum: ["positive", "negative", "insufficient"], required: true },
    accuracy: { type: Number, min: 0, max: 1, required: true },
    confidence: { type: Number, min: 0, max: 1, required: true },
    independence: {
      type: String,
      enum: ["spontaneous", "prompted", "imitated"],
      required: true,
    },
    evidenceExcerpt: { type: String, required: true, maxlength: 1500 },
    aiCallId: { type: Schema.Types.ObjectId, ref: "AICallLog" },
  },
  { timestamps: true },
);

competencyObservationSchema.index({ observationKey: 1 }, { unique: true });
competencyObservationSchema.index({ userId: 1, competencyCode: 1, createdAt: 1 });
competencyObservationSchema.index({ userId: 1, createdAt: -1 });
competencyObservationSchema.index({ sourceTurnId: 1, competencyCode: 1 });
competencyObservationSchema.index({ competencyCode: 1, createdAt: -1 });

export type CompetencyObservationDoc = InferSchemaType<typeof competencyObservationSchema> & {
  _id: mongoose.Types.ObjectId;
};

/** Guard against Mongoose recompiling the model on hot-reload. */
export const CompetencyObservation: Model<CompetencyObservationDoc> =
  (mongoose.models.CompetencyObservation as Model<CompetencyObservationDoc>) ??
  mongoose.model<CompetencyObservationDoc>("CompetencyObservation", competencyObservationSchema);
