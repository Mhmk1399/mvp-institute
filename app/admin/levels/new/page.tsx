import Link from "next/link";

import { requireRole } from "@/lib/auth/guards";
import { CEFR_CODES, type CEFRCode } from "@/lib/models/level";
import { listLevels } from "@/lib/services/level";
import { LevelForm } from "@/components/levels/level-form";

export default async function NewLevelPage() {
  await requireRole("admin");
  const levels = await listLevels();
  const existing = new Set(levels.map((level) => level.code));
  const availableCodes: CEFRCode[] = CEFR_CODES.filter((code) => !existing.has(code));

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <Link href="/admin/levels" className="text-sm text-foreground/60 hover:underline">
        ← Back to levels
      </Link>
      <h1 className="mb-6 mt-4 text-2xl font-semibold tracking-tight">Create level</h1>

      {availableCodes.length === 0 ? (
        <p className="rounded-2xl border border-black/10 p-8 text-center text-sm text-foreground/60 dark:border-white/15">
          All CEFR levels already exist.
        </p>
      ) : (
        <LevelForm mode="create" availableCodes={availableCodes} />
      )}
    </main>
  );
}
