"use client";

import Link from "next/link";

import type { Role } from "@/lib/models/user";
import type { LevelDTO } from "@/lib/services/level";

export function LevelsPanel({ levels, role }: { levels: LevelDTO[]; role: Role }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Levels & Curriculum</h2>
          <p className="mt-1 text-sm text-[#91A4B7]">CEFR goals currently used by placement and classes.</p>
        </div>
        {role === "admin" ? (
          <Link href="/admin/levels/new" className="rounded-2xl bg-[#57D7FF] px-4 py-2 text-sm font-semibold text-[#07111F] outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#57D7FF]/70">
            Create level
          </Link>
        ) : null}
      </div>

      {levels.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {levels.map((level) => (
            <article key={level.code} className="rounded-3xl border border-white/10 bg-[#0D1B2A]/78 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-2xl font-semibold text-[#57D7FF]">{level.code}</p>
                  <h3 className="mt-1 font-semibold">{level.name}</h3>
                </div>
                <span className={level.isActive ? "text-sm text-[#55E6B1]" : "text-sm text-[#91A4B7]"}>
                  {level.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#91A4B7]">{level.description}</p>
              <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs text-[#91A4B7]">
                <Count label="Grammar" value={level.goals.grammar.length} />
                <Count label="Vocab" value={level.goals.vocabulary.length} />
                <Count label="Functions" value={level.goals.functions.length} />
                <Count label="Can-do" value={level.canDoStatements.length} />
              </div>
              <Link href={`/admin/levels/${level.code}`} className="mt-4 inline-flex rounded-2xl border border-white/12 px-3 py-2 text-sm font-medium outline-none hover:bg-white/6 focus-visible:ring-2 focus-visible:ring-[#57D7FF]/70">
                Edit content
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-3xl border border-white/10 bg-[#0D1B2A]/78 p-6 text-sm text-[#91A4B7]">No levels yet.</p>
      )}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
      <p className="text-lg font-semibold text-[#F3F8FF]">{value}</p>
      <p className="mt-1">{label}</p>
    </div>
  );
}
