import "server-only";

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/** Who a user is allowed to be. Never accepted from client input. */
export type Role = "student" | "teacher" | "admin";

/**
 * The only model in the project (by design). Credentials live here as a scrypt
 * hash — never a raw password.
 */
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // Profile fields collected later (placement / onboarding), not at sign-up.
    nikname: { type: String, trim: true, default: "" },
    nativelanguage: { type: String, trim: true, default: "" },
    status: { type: String, trim: true, default: "active" },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    isEmailverified: { type: Boolean, default: false },
    image: { type: String, default: "" },
    role: {
      type: String,
      enum: ["student", "teacher", "admin"],
      default: "student",
      required: true,
    },
    cefrLevel: {
      type: String,
      enum: ["A1", "A2", "B1", "B2", "C1", "C2"],
    },
    placementStatus: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending",
      required: true,
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema> & {
  _id: mongoose.Types.ObjectId;
};

/**
 * Guard against Mongoose recompiling the model on hot-reload
 * ("OverwriteModelError").
 */
export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ??
  mongoose.model<UserDoc>("User", userSchema);
