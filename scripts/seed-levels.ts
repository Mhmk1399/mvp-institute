import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * Ensure a Level record exists for every CEFR code, using minimal placeholders.
 * Existing records are never overwritten. Requires an admin user identified by
 * SEED_ADMIN_EMAIL.
 *
 * Re-execs once with the `react-server` export condition (server-only modules)
 * and `--env-file=.env`, so `tsx scripts/seed-levels.ts` works without flags.
 */
function ensureRuntime(): void {
  if (process.env.__SEED_LEVELS_CHILD === "1") return;
  const flags = ["--conditions=react-server"];
  if (existsSync(".env")) flags.push("--env-file=.env");
  const result = spawnSync(
    process.execPath,
    [...flags, ...process.execArgv, ...process.argv.slice(1)],
    { stdio: "inherit", env: { ...process.env, __SEED_LEVELS_CHILD: "1" } },
  );
  process.exit(result.status ?? 1);
}

ensureRuntime();

async function main(): Promise<void> {
  const { connectToDatabase } = await import("@/lib/db/mongoose");
  const { User } = await import("@/lib/models/user");
  const { CEFR_CODES } = await import("@/lib/models/level");
  const { getLevelByCode, createLevel } = await import("@/lib/services/level");
  const mongoose = (await import("mongoose")).default;

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  if (!adminEmail) throw new Error("SEED_ADMIN_EMAIL is required");

  await connectToDatabase();

  const admin = await User.findOne({ email: adminEmail.toLowerCase(), role: "admin" }).lean();
  if (!admin) {
    throw new Error(`No admin user found for SEED_ADMIN_EMAIL=${adminEmail}`);
  }
  const actorId = String(admin._id);

  const created: string[] = [];
  const skipped: string[] = [];

  for (const code of CEFR_CODES) {
    if (await getLevelByCode(code)) {
      skipped.push(code);
      continue;
    }
    await createLevel(
      {
        code,
        name: `CEFR ${code}`,
        description: `Placeholder curriculum for ${code}. Replace with authored content.`,
        goals: {
          grammar: [`Placeholder grammar goal for ${code}`],
          vocabulary: [`Placeholder vocabulary goal for ${code}`],
          functions: [`Placeholder communication function for ${code}`],
        },
        canDoStatements: [`Placeholder can-do statement for ${code}`],
        passThreshold: 0.6,
        isActive: true,
      },
      actorId,
    );
    created.push(code);
  }

  console.log(`Created: ${created.length ? created.join(", ") : "(none)"}`);
  console.log(`Skipped: ${skipped.length ? skipped.join(", ") : "(none)"}`);

  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Level seeding failed: ${message}`);
  process.exit(1);
});
