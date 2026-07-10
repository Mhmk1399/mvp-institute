import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/guards";
import { cefrCodeSchema } from "@/lib/schemas/level";
import { getLevelByCode } from "@/lib/services/level";
import { LevelForm } from "@/components/levels/level-form";

export default async function EditLevelPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await requireRole("admin", "teacher");

  const { code } = await params;
  const parsed = cefrCodeSchema.safeParse(code);
  if (!parsed.success) notFound();

  const level = await getLevelByCode(parsed.data);
  if (!level) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <Link href="/admin/levels" className="text-sm text-foreground/60 hover:underline">
        ← Back to levels
      </Link>
      <h1 className="mb-6 mt-4 text-2xl font-semibold tracking-tight">
        Edit level <span className="font-mono">{level.code}</span>
      </h1>
      <LevelForm mode="edit" level={level} />
    </main>
  );
}
