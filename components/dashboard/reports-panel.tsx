"use client";

import type { ReportsDTO } from "@/lib/services/dashboard";

export function ReportsPanel({ reports }: { reports: ReportsDTO }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ReportCard title="Placement" rows={[
        ["Active", reports.placement.active],
        ["Completed", reports.placement.completed],
        ["Needs review", reports.placement.reviewNeeded],
      ]} />
      <ReportCard title="Classes" rows={[
        ["Choosing subject", reports.classes.choosing],
        ["Active", reports.classes.active],
        ["Completed", reports.classes.completed],
        ["Failed turns", reports.classes.failedTurns],
      ]} />
      <section className="rounded-3xl border border-white/10 bg-[#0D1B2A]/78 p-5">
        <h2 className="text-base font-semibold">Level distribution</h2>
        <div className="mt-4 space-y-3">
          {reports.levelDistribution.length ? (
            reports.levelDistribution.map((item) => (
              <div key={item.level} className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm">
                <span>{item.level}</span>
                <span className="font-semibold text-[#57D7FF]">{item.count}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-[#91A4B7]">No placed students yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function ReportCard({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#0D1B2A]/78 p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm">
            <span className="text-[#91A4B7]">{label}</span>
            <span className="font-semibold text-[#F3F8FF]">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
