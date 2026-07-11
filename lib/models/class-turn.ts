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

const teacherDecisionSchema = new Schema(
  {
    move: { type: String, required: true },
    reason: { type: String, required: true },
    targetGoal: { type: String },
    turnObjective: { type: String, required: true },
    languageMode: { type: String, required: true },
    targetCompetencyCode: { type: String },
    evidenceIntent: { type: String },
    contextKey: { type: String },
  },
  { _id: false },
);

const competencyCandidateSchema = new Schema(
  {
    competencyCode: { type: String, required: true },
    result: { type: String, required: true },
    accuracy: { type: Number, required: true },
    confidence: { type: Number, required: true },
    independence: { type: String, required: true },
    evidenceExcerpt: { type: String, required: true },
  },
  { _id: false },
);

const responsePlanSchema = new Schema(
  {
    acknowledgement: { type: String },
    correctionApproach: { type: String, required: true },
    teachingPoint: { type: String },
    followUpQuestion: { type: String },
    maximumReplySentences: { type: Number, required: true },
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
    resolvedTargets: { type: [String], default: [] },

    teacherDecision: { type: teacherDecisionSchema },
    responsePlan: { type: responsePlanSchema },

    aiCallId: { type: Schema.Types.ObjectId, ref: "AICallLog" },
    plannerAiCallId: { type: Schema.Types.ObjectId, ref: "AICallLog" },
    replyAiCallId: { type: Schema.Types.ObjectId, ref: "AICallLog" },

    inputMode: { type: String, enum: ["text", "voice"] },
    transcription: {
      provider: { type: String },
      model: { type: String },
      transcript: { type: String },
      completedAt: { type: Date },
    },
    realtimeResponseId: { type: String },

    // ML7 competency-aware fields (optional, backward-compatible).
    targetCompetencyCode: { type: String },
    relatedCompetencyCodes: { type: [String], default: [] },
    evidenceIntent: { type: String },
    competencyContextKey: { type: String },
    competencyCandidates: { type: [competencyCandidateSchema], default: [] },
    competencyObservationIds: { type: [Schema.Types.ObjectId], default: [] },
    competencySyncStatus: {
      type: String,
      enum: ["not-required", "pending", "completed", "failed"],
      default: "not-required",
    },

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
