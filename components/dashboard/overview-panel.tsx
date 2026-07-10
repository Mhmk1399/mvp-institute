"use client";

import type { OverviewDTO, StudentHomeDTO } from "@/lib/services/dashboard";

function Metric({ label, value, tone = "cyan" }: { label: string; value: number | string; tone?: "cyan" | "mint" | "amber" | "violet" }) {
  const colors = {
    cyan: "text-[#57D7FF]",
    mint: "text-[#55E6B1]",
    amber: "text-[#FFC66D]",
    violet: "text-[#9478FF]",
  };
  return (
    <div className="rounded-3xl border border-white/10 bg-[#12263A]/72 p-5 shadow-[0_16px_60px_rgba(0,0,0,0.18)]">
      <p className="text-sm text-[#91A4B7]">{label}</p>
      <p className={`mt-3 text-3xl font-semibold tracking-tight ${colors[tone]}`}>{value}</p>
    </div>
  );
}

export function OverviewPanel({ overview }: { overview: OverviewDTO }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="Users" value={overview.totals.users} />
        <Metric label="Students" value={overview.totals.students} tone="mint" />
        <Metric label="Teachers" value={overview.totals.teachers} tone="violet" />
        <Metric label="Completed exams" value={overview.totals.completedExams} tone="amber" />
        <Metric label="Open classes" value={overview.totals.openClasses} />
        <Metric label="Completed classes" value={overview.totals.completedClasses} tone="mint" />
      </div>
      <section className="rounded-3xl border border-white/10 bg-[#0D1B2A]/78 p-5">
        <h2 className="text-base font-semibold">Recent activity</h2>
        <div className="mt-4 space-y-3">
          {overview.recentActivity.length ? (
            overview.recentActivity.map((item) => (
              <div key={item.id} className="flex flex-col gap-1 rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-sm text-[#91A4B7]">{item.detail}</p>
                </div>
                <time className="text-xs text-[#91A4B7]">{item.at ? new Date(item.at).toLocaleDateString() : ""}</time>
              </div>
            ))
          ) : (
            <p className="rounded-2xl border border-white/8 p-5 text-sm text-[#91A4B7]">No activity yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export function StudentHomePanel({ home }: { home: StudentHomeDTO }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Metric label="Placement" value={home.placementStatus === "completed" ? home.cefrLevel ?? "Done" : "Pending"} tone={home.placementStatus === "completed" ? "mint" : "amber"} />
      <Metric label="Open class" value={home.openClassStatus ? home.openClassStatus.replace("-", " ") : "None"} />
      <Metric label="Completed classes" value={home.completedClassCount} tone="violet" />
      <section className="rounded-3xl border border-white/10 bg-[#0D1B2A]/78 p-5 lg:col-span-3">
        <h2 className="text-base font-semibold">Learning status</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#91A4B7]">
          {home.placementStatus === "completed"
            ? `Your current learning level is ${home.cefrLevel ?? "set"}. Continue classes to build fluency and review your completed sessions here.`
            : "Start the placement exam to unlock your first AI speaking class."}
        </p>
      </section>
    </div>
  );
}
