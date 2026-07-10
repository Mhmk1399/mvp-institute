import "server-only";

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * One class turn = one student message + AI teacher reply. Each row is a future
 * teacher-review row; no teacher-feedback fields live here.
 */
const correctionSchema = new Schema(
  {
    original: { type: String, required: true },
    corrected: { type: String, required: true },
    explanation: { type: String, required: true },
  },
  { _id: false },
);

const taughtSchema = new Schema(
  {
    type: { type: String, enum: ["vocabulary", "grammar", "function"], required: true },
    item: { type: String, required: true },
    evidence: { type: String, required: true },
  },
  { _id: false },
);

const classTurnSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "ClassSession", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    index: { type: Number, required: true },

    status: {
      type: String,
      enum: ["processing", "completed", "failed"],
      default: "processing",
      required: true,
    },

    studentMessage: { type: String, required: true, trim: true, minlength: 1, maxlength: 4000 },
    aiMessage: { type: String, maxlength: 10000 },

    corrections: { type: [correctionSchema], default: [] },
    elicitedTargets: { type: [String], default: [] },
    taughtInThisTurn: { type: [taughtSchema], default: [] },

    aiCallId: { type: Schema.Types.ObjectId, ref: "AICallLog" },

    submissionKey: { type: String, required: true },

    errorCode: { type: String },
  },
  { timestamps: true },
);

classTurnSchema.index({ sessionId: 1, index: 1 }, { unique: true });
classTurnSchema.index({ sessionId: 1, submissionKey: 1 }, { unique: true });
classTurnSchema.index({ userId: 1, createdAt: -1 });
classTurnSchema.index({ status: 1, updatedAt: -1 });

export type ClassTurnDoc = InferSchemaType<typeof classTurnSchema> & {
  _id: mongoose.Types.ObjectId;
};

/** Guard against Mongoose recompiling the model on hot-reload. */
export const ClassTurn: Model<ClassTurnDoc> =
  (mongoose.models.ClassTurn as Model<ClassTurnDoc>) ??
  mongoose.model<ClassTurnDoc>("ClassTurn", classTurnSchema);
