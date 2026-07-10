/**
 * Idempotently upsert one admin and one teacher from env vars. Standalone —
 * not part of the Next.js runtime.
 *
 * The app modules it reuses are marked `server-only`, which throws under a
 * plain Node resolver; run with the `react-server` condition to neutralise it,
 * and load `.env` so MONGODB_URI is present:
 *
 *   npx tsx --env-file=.env --conditions=react-server scripts/seed-admin.ts
 *
 * Reads SEED_ADMIN_EMAIL/PASSWORD and SEED_TEACHER_EMAIL/PASSWORD.
 */
import { connectToDatabase } from "@/lib/db/mongoose";
import { hashPassword } from "@/lib/auth/crypto";
import { User, type Role } from "@/lib/models/user";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

/** Create or update a privileged user by email, resetting password + role. */
async function upsertUser(role: Role, email: string, password: string): Promise<void> {
  const normalized = email.toLowerCase();
  await User.findOneAndUpdate(
    { email: normalized },
    {
      $set: {
        role,
        passwordHash: hashPassword(password),
        isEmailverified: true,
      },
      $setOnInsert: {
        name: normalized,
        nikname: normalized,
        nativelanguage: "en",
        status: "active",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  console.log(`Seeded ${role}: ${normalized}`);
}

async function main(): Promise<void> {
  const mongoose = await connectToDatabase();
  try {
    await upsertUser(
      "admin",
      requireEnv("SEED_ADMIN_EMAIL"),
      requireEnv("SEED_ADMIN_PASSWORD"),
    );
    await upsertUser(
      "teacher",
      requireEnv("SEED_TEACHER_EMAIL"),
      requireEnv("SEED_TEACHER_PASSWORD"),
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
