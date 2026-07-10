import "server-only";

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

import { CEFR_ORDER } from "@/lib/exam/engine";

/**
 * One turn = one question/answer/score. Each row is a future teacher-review row;
 * no teacher-feedback fields live here yet.
 */
const aiScoreSchema = new Schema(
  {
    criteria: {
      accuracy: { type: Number, required: true },
      grammar: { type: Number, required: true },
      vocabulary: { type: Number, required: true },
      taskCompletion: { type: Number, required: true },
    },
    overallScore: { type: Number, required: true },
    evidence: { type: [String], default: [] },
    strengths: { type: [String], default: [] },
    weaknesses: { type: [String], default: [] },
    confidence: { type: Number, required: true },
  },
  { _id: false },
);

const examTurnSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "ExamSession", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    index: { type: Number, required: true },

    status: {
      type: String,
      enum: ["awaiting-answer", "scored"],
      default: "awaiting-answer",
      required: true,
    },

    targetLevel: { type: String, enum: [...CEFR_ORDER], required: true },
    targetedSkill: {
      type: String,
      enum: ["grammar", "vocabulary", "function"],
      required: true,
    },
    targetedGoal: { type: String, required: true },
    goalKey: { type: String, required: true },

    question: { type: String, required: true },
    studentAnswer: { type: String, maxlength: 5000 },

    aiScore: { type: aiScoreSchema },

    confidence: { type: Number },
    needsTeacherReview: { type: Boolean, default: false, required: true },

    abilityBefore: { type: Number, required: true },
    abilityAfter: { type: Number },
    projectedLevelAfter: { type: String, enum: [...CEFR_ORDER] },

    questionAiCallId: { type: Schema.Types.ObjectId, ref: "AICallLog" },
    scoreAiCallId: { type: Schema.Types.ObjectId, ref: "AICallLog" },

    submissionKey: { type: String },
  },
  { timestamps: true },
);

examTurnSchema.index({ sessionId: 1, index: 1 }, { unique: true });
examTurnSchema.index(
  { sessionId: 1, submissionKey: 1 },
  { unique: true, partialFilterExpression: { submissionKey: { $exists: true } } },
);
examTurnSchema.index({ userId: 1, createdAt: 1 });
examTurnSchema.index({ needsTeacherReview: 1, createdAt: 1 });

export type ExamTurnDoc = InferSchemaType<typeof examTurnSchema> & {
  _id: mongoose.Types.ObjectId;
};

/** Guard against Mongoose recompiling the model on hot-reload. */
export const ExamTurn: Model<ExamTurnDoc> =
  (mongoose.models.ExamTurn as Model<ExamTurnDoc>) ??
  mongoose.model<ExamTurnDoc>("ExamTurn", examTurnSchema);
