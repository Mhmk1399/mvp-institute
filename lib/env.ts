import "server-only";

import { z } from "zod";

/**
 * Server-only environment validation. Never imported from a Client Component,
 * and no value here is exposed via NEXT_PUBLIC_.
 */
// `next build` imports server modules without runtime secrets present. Relax
// required-secret validation during that phase only; runtime keeps it strict.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

/** Required at runtime, but tolerated as empty during `next build`. */
const requiredSecret = (message: string) =>
  isBuildPhase ? z.string().default("") : z.string().min(1, message);

const exactOrigins = z
  .string()
  .default("http://localhost:3000")
  .transform((value, context) => {
    const origins = value.split(",").map((origin) => origin.trim()).filter(Boolean);
    if (!origins.length) {
      context.addIssue({ code: "custom", message: "At least one realtime origin is required" });
      return z.NEVER;
    }
    for (const origin of origins) {
      try {
        if (new URL(origin).origin !== origin) throw new Error();
      } catch {
        context.addIssue({ code: "custom", message: `Invalid exact origin: ${origin}` });
        return z.NEVER;
      }
    }
    return origins;
  });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  // Secret used to sign session JWTs (HMAC-SHA256). openssl rand -base64 32
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  // AI layer. Provider is intentionally locked to "openai" for M1.
  OPENAI_API_KEY: requiredSecret("OPENAI_API_KEY is required"),
  AI_PROVIDER: z.enum(["openai"]).default("openai"),
  // Model ids come only from config — never hardcode a dated model name.
  AI_GENERATION_MODEL: requiredSecret("AI_GENERATION_MODEL is required"),
  AI_SCORING_MODEL: requiredSecret("AI_SCORING_MODEL is required"),
  AI_TRANSCRIPTION_MODEL: z.string().min(1).default("gpt-realtime-whisper"),
  AI_TRANSCRIPTION_DELAY: z.enum(["minimal", "low", "medium"]).default("minimal"),
  REALTIME_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  REALTIME_ALLOWED_ORIGINS: exactOrigins,
  NEXT_PUBLIC_REALTIME_WS_URL: z.string().url().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const data = parsed.data;

if (data.NODE_ENV === "production" && data.REALTIME_ALLOWED_ORIGINS.includes("*")) {
  throw new Error("Invalid environment configuration: wildcard realtime origin is forbidden in production");
}

export const env = {
  nodeEnv: data.NODE_ENV,
  isProduction: data.NODE_ENV === "production",
  mongodbUri: data.MONGODB_URI,
  authSecret: data.AUTH_SECRET,
  // Session lifetime for the JWT cookie: 7 days.
  sessionMaxAgeSeconds: 60 * 60 * 24 * 7,
  // AI layer configuration. Never logged.
  openaiApiKey: data.OPENAI_API_KEY,
  aiProvider: data.AI_PROVIDER,
  aiGenerationModel: data.AI_GENERATION_MODEL,
  aiScoringModel: data.AI_SCORING_MODEL,
  aiTranscriptionModel: data.AI_TRANSCRIPTION_MODEL,
  aiTranscriptionDelay: data.AI_TRANSCRIPTION_DELAY,
  realtimePort: data.REALTIME_PORT,
  realtimeAllowedOrigins: data.REALTIME_ALLOWED_ORIGINS,
  realtimeWsUrl: data.NEXT_PUBLIC_REALTIME_WS_URL,
} as const;
