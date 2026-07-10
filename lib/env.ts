import "server-only";

import { z } from "zod";

/**
 * Server-only environment validation. Never imported from a Client Component,
 * and no value here is exposed via NEXT_PUBLIC_.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  // Secret used to sign session JWTs (HMAC-SHA256). openssl rand -base64 32
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const data = parsed.data;

export const env = {
  nodeEnv: data.NODE_ENV,
  isProduction: data.NODE_ENV === "production",
  mongodbUri: data.MONGODB_URI,
  authSecret: data.AUTH_SECRET,
  // Session lifetime for the JWT cookie: 7 days.
  sessionMaxAgeSeconds: 60 * 60 * 24 * 7,
} as const;
