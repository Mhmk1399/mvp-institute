import Link from "next/link";

import { requireRole } from "@/lib/auth/guards";
import { listLevels } from "@/lib/services/level";

export default async function LevelsPage() {
  const user = await requireRole("admin", "teacher");
  const levels = await listLevels();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CEFR levels</h1>
          <p className="text-sm text-foreground/60">Curriculum content by level.</p>
        </div>
        {user.role === "admin" ? (
          <Link
            href="/admin/levels/new"
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Create level
          </Link>
        ) : null}
      </div>

      {levels.length === 0 ? (
        <p className="rounded-2xl border border-black/10 p-8 text-center text-sm text-foreground/60 dark:border-white/15">
          No levels yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/10 dark:border-white/15">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-black/10 text-xs uppercase tracking-wide text-foreground/50 dark:border-white/15">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 text-right">Grammar</th>
                <th className="px-4 py-3 text-right">Vocab</th>
                <th className="px-4 py-3 text-right">Functions</th>
                <th className="px-4 py-3 text-right">Can-do</th>
                <th className="px-4 py-3 text-right">Threshold</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {levels.map((level) => (
                <tr
                  key={level.code}
                  className="border-b border-black/5 last:border-0 dark:border-white/10"
                >
                  <td className="px-4 py-3 font-mono font-medium">{level.code}</td>
                  <td className="px-4 py-3">{level.name}</td>
                  <td className="px-4 py-3 text-right">{level.goals.grammar.length}</td>
                  <td className="px-4 py-3 text-right">{level.goals.vocabulary.length}</td>
                  <td className="px-4 py-3 text-right">{level.goals.functions.length}</td>
                  <td className="px-4 py-3 text-right">{level.canDoStatements.length}</td>
                  <td className="px-4 py-3 text-right">{level.passThreshold}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        level.isActive
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-foreground/40"
                      }
                    >
                      {level.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground/60">
                    {new Date(level.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/levels/${level.code}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
