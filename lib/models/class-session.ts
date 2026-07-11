import "server-only";

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

import { CEFR_ORDER } from "@/lib/exam/engine";

/**
 * One AI speaking class. All state is owned here; the LLM stays stateless. Full
 * Level documents are never duplicated into the session.
 */
const offeredSubjectSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    targetedGoals: { type: [String], default: [] },
  },
  { _id: false },
);

const taughtItemSchema = new Schema(
  {
    type: { type: String, enum: ["vocabulary", "grammar", "function"], required: true },
    item: { type: String, required: true },
    evidence: { type: String, required: true },
    turnId: { type: Schema.Types.ObjectId, ref: "ClassTurn" },
  },
  { _id: false },
);

const learnedItemSchema = new Schema(
  {
    type: { type: String, enum: ["vocabulary", "grammar", "function"], required: true },
    item: { type: String, required: true },
    evidence: { type: String, required: true },
  },
  { _id: false },
);

const finalSummarySchema = new Schema(
  {
    summary: { type: String, required: true },
    learnedItems: { type: [learnedItemSchema], default: [] },
    strengths: { type: [String], default: [] },
    nextSteps: { type: [String], default: [] },
  },
  { _id: false },
);

const classSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    level: { type: String, enum: [...CEFR_ORDER], required: true },
    status: {
      type: String,
      enum: ["choosing-subject", "active", "completed", "abandoned"],
      default: "choosing-subject",
      required: true,
    },
    subject: { type: String, trim: true },
    offeredSubjects: { type: [offeredSubjectSchema], default: [] },
    targetedGoals: { type: [String], default: [] },
    taughtItems: { type: [taughtItemSchema], default: [] },
    pendingElicitedTargets: { type: [String], default: [] },
    practisedCompetencyCodes: { type: [String], default: [] },
    recentCompetencyCodes: { type: [String], default: [] },
    runningSummary: { type: String, default: "" },
    finalSummary: { type: finalSummarySchema },
    turnCount: { type: Number, default: 0, required: true },
    subjectPickerAiCallId: { type: Schema.Types.ObjectId, ref: "AICallLog" },
    summaryAiCallId: { type: Schema.Types.ObjectId, ref: "AICallLog" },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

classSessionSchema.index({ userId: 1, status: 1 });
classSessionSchema.index({ userId: 1, createdAt: -1 });
classSessionSchema.index({ status: 1, updatedAt: -1 });
// At most one open (choosing-subject | active) session per user.
classSessionSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["choosing-subject", "active"] } },
  },
);

export type ClassSessionDoc = InferSchemaType<typeof classSessionSchema> & {
  _id: mongoose.Types.ObjectId;
};

/** Guard against Mongoose recompiling the model on hot-reload. */
export const ClassSession: Model<ClassSessionDoc> =
  (mongoose.models.ClassSession as Model<ClassSessionDoc>) ??
  mongoose.model<ClassSessionDoc>("ClassSession", classSessionSchema);
