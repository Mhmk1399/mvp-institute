import "server-only";

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

import { CEFR_ORDER } from "@/lib/exam/engine";

/**
 * One adaptive placement exam per attempt. Ability lives here; prompt text and
 * Level content are never duplicated into the session.
 */
const examSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["active", "completed", "abandoned"],
      default: "active",
      required: true,
    },
    abilityEstimate: { type: Number, required: true, min: 0, max: 5, default: 1.5 },
    turnCount: { type: Number, required: true, default: 0 },
    recentProjectedLevels: {
      type: [{ type: String, enum: [...CEFR_ORDER] }],
      default: [],
    },
    coveredGoalKeys: { type: [String], default: [] },
    finalLevel: { type: String, enum: [...CEFR_ORDER] },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

examSessionSchema.index({ userId: 1, status: 1 });
examSessionSchema.index({ status: 1, updatedAt: -1 });
// At most one active session per user.
examSessionSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);

export type ExamSessionDoc = InferSchemaType<typeof examSessionSchema> & {
  _id: mongoose.Types.ObjectId;
};

/** Guard against Mongoose recompiling the model on hot-reload. */
export const ExamSession: Model<ExamSessionDoc> =
  (mongoose.models.ExamSession as Model<ExamSessionDoc>) ??
  mongoose.model<ExamSessionDoc>("ExamSession", examSessionSchema);
