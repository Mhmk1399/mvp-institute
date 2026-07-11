import "server-only";

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * One record per AI call (success or failure). Raw messages and responses are
 * stored only after redaction by lib/ai/logger.ts — never a secret in the clear.
 */
const messageSchema = new Schema(
  {
    role: { type: String, enum: ["system", "user", "assistant"], required: true },
    content: { type: String, required: true },
  },
  { _id: false },
);

const aiCallLogSchema = new Schema(
  {
    provider: { type: String, required: true },
    model: { type: String, required: true },
    operation: { type: String, enum: ["chat", "chatJSON", "realtime"], required: true },

    promptTemplateId: { type: String },
    promptVersion: { type: String },

    messages: { type: [messageSchema], default: [] },

    response: { type: String },
    parsedResponse: { type: Schema.Types.Mixed },

    parsedOk: { type: Boolean, required: true },
    repairAttempted: { type: Boolean, required: true },

    latencyMs: { type: Number, required: true },

    inputTokens: { type: Number },
    outputTokens: { type: Number },
    totalTokens: { type: Number },
    costUsd: { type: Number },

    context: {
      userId: { type: Schema.Types.ObjectId },
      sessionId: { type: Schema.Types.ObjectId },
      turnId: { type: Schema.Types.ObjectId },
    },

    error: {
      name: { type: String },
      message: { type: String },
      code: { type: String },
    },
  },
  { timestamps: true },
);

aiCallLogSchema.index({ createdAt: -1 });
aiCallLogSchema.index({ provider: 1, model: 1, createdAt: -1 });
aiCallLogSchema.index({ "context.userId": 1, createdAt: -1 });
aiCallLogSchema.index({ "context.sessionId": 1, createdAt: 1 });
aiCallLogSchema.index({ promptTemplateId: 1, promptVersion: 1, createdAt: -1 });
aiCallLogSchema.index({ parsedOk: 1, createdAt: -1 });

export type AICallLogDoc = InferSchemaType<typeof aiCallLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

/** Guard against Mongoose recompiling the model on hot-reload. */
export const AICallLog: Model<AICallLogDoc> =
  (mongoose.models.AICallLog as Model<AICallLogDoc>) ??
  mongoose.model<AICallLogDoc>("AICallLog", aiCallLogSchema);
