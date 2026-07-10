import "server-only";

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const CEFR_CODES = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CEFRCode = (typeof CEFR_CODES)[number];

/** Reject case-insensitive duplicates after trimming. */
function noDuplicateEntries(values: string[]): boolean {
  const seen = values.map((value) => value.trim().toLowerCase());
  return new Set(seen).size === seen.length;
}

const dedupedStringArray = {
  type: [{ type: String, trim: true }],
  validate: {
    validator: noDuplicateEntries,
    message: "Entries must be unique (case-insensitive)",
  },
};

const levelSchema = new Schema(
  {
    code: {
      type: String,
      enum: CEFR_CODES,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    goals: {
      grammar: dedupedStringArray,
      vocabulary: dedupedStringArray,
      functions: dedupedStringArray,
    },
    canDoStatements: dedupedStringArray,
    passThreshold: { type: Number, required: true, min: 0, max: 1 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

export type LevelDoc = InferSchemaType<typeof levelSchema> & {
  _id: mongoose.Types.ObjectId;
};

/** Guard against Mongoose recompiling the model on hot-reload. */
export const Level: Model<LevelDoc> =
  (mongoose.models.Level as Model<LevelDoc>) ??
  mongoose.model<LevelDoc>("Level", levelSchema);
