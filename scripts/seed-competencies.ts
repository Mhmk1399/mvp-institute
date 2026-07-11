import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import type { LevelDTO } from "@/lib/services/level";
import type { CompetencyDomain } from "@/lib/schemas/competency";

/**
 * Convert existing Level curriculum into initial CompetencyDefinition records.
 * Idempotent: creates missing codes only, never overwrites, never touches Levels
 * or learner state, never calls AI. Requires an admin from SEED_ADMIN_EMAIL.
 *
 * Re-execs once with the react-server condition + .env so `tsx` works flag-free.
 */
function ensureRuntime(): void {
  if (process.env.__SEED_COMPETENCIES_CHILD === "1") return;
  const flags = ["--conditions=react-server"];
  if (existsSync(".env")) flags.push("--env-file=.env");
  const result = spawnSync(
    process.execPath,
    [...flags, ...process.execArgv, ...process.argv.slice(1)],
    { stdio: "inherit", env: { ...process.env, __SEED_COMPETENCIES_CHILD: "1" } },
  );
  process.exit(result.status ?? 1);
}

ensureRuntime();

interface DomainGroup {
  items: (level: LevelDTO) => string[];
  domain: CompetencyDomain;
  prefix: string;
}

const GROUPS: DomainGroup[] = [
  { items: (level) => level.goals.grammar, domain: "grammar", prefix: "GR" },
  { items: (level) => level.goals.vocabulary, domain: "vocabulary", prefix: "VO" },
  { items: (level) => level.goals.functions, domain: "function", prefix: "FN" },
  { items: (level) => level.canDoStatements, domain: "communication", prefix: "CM" },
];

async function main(): Promise<void> {
  const { connectToDatabase } = await import("@/lib/db/mongoose");
  const { User } = await import("@/lib/models/user");
  const { listLevels } = await import("@/lib/services/level");
  const { getCompetencyDefinitionByCode, createCompetencyDefinition, CompetencyConflictError } =
    await import("@/lib/services/competency");
  const mongoose = (await import("mongoose")).default;

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  if (!adminEmail) throw new Error("SEED_ADMIN_EMAIL is required");

  await connectToDatabase();
  const admin = await User.findOne({ email: adminEmail.toLowerCase(), role: "admin" }).lean();
  if (!admin) throw new Error(`No admin user found for SEED_ADMIN_EMAIL=${adminEmail}`);
  const actorId = String(admin._id);

  const levels = await listLevels();
  const createdByKey: Record<string, number> = {};
  const skippedByKey: Record<string, number> = {};
  let created = 0;
  let skipped = 0;

  for (const level of levels) {
    for (const group of GROUPS) {
      const items = group.items(level);
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index].trim();
        if (item.length < 2) continue;
        const code = `${group.prefix}-${level.code}-${String(index + 1).padStart(3, "0")}`;
        const key = `${level.code}/${group.domain}`;

        if (await getCompetencyDefinitionByCode(code)) {
          skipped += 1;
          skippedByKey[key] = (skippedByKey[key] ?? 0) + 1;
          continue;
        }

        try {
          await createCompetencyDefinition(
            {
              code,
              domain: group.domain,
              level: level.code,
              name: item,
              description: `Imported from the existing ${level.code} curriculum.`,
              performanceDescriptor: `The learner can demonstrate: ${item}`,
              evidenceRequired: 5,
              accuracyThreshold: level.passThreshold,
              contextsRequired: 2,
              confidenceThreshold: 0.75,
              positivePatterns: [],
              negativePatterns: [],
              exceptions: [],
              prerequisites: [],
              isCritical: false,
              isActive: level.isActive,
            },
            actorId,
          );
          created += 1;
          createdByKey[key] = (createdByKey[key] ?? 0) + 1;
        } catch (error) {
          if (error instanceof CompetencyConflictError) {
            skipped += 1;
            skippedByKey[key] = (skippedByKey[key] ?? 0) + 1;
          } else {
            throw error;
          }
        }
      }
    }
  }

  console.log(`Created ${created}, skipped ${skipped}`);
  const keys = Array.from(new Set([...Object.keys(createdByKey), ...Object.keys(skippedByKey)])).sort();
  for (const key of keys) {
    console.log(`  ${key}: created ${createdByKey[key] ?? 0}, skipped ${skippedByKey[key] ?? 0}`);
  }

  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Competency seeding failed: ${message}`);
  process.exit(1);
});
