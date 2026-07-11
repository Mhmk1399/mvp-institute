"use client";

import Link from "next/link";

import { ProfilePanel } from "@/components/dashboard/profile-panel";
import { StudentHomePanel } from "@/components/dashboard/overview-panel";
import type { DashboardPageData } from "@/lib/dashboard/data";
import type { DashboardTab } from "@/lib/schemas/dashboard";

export function StudentDashboard({ activeTab, data }: { activeTab: DashboardTab; data: DashboardPageData }) {
  if (activeTab === "placement" && data.kind === "student-placement") {
    return <StudentPlacementPanel data={data.placement} />;
  }
  if (activeTab === "classes" && data.kind === "student-classes") {
    return <StudentClassesPanel classes={data.classes} />;
  }
  if (activeTab === "profile" && data.kind === "profile") {
    return <ProfilePanel profile={data.profile} />;
  }
  if (data.kind === "student-home") return <StudentHomePanel home={data.home} />;
  return null;
}

function StudentPlacementPanel({ data }: { data: Extract<DashboardPageData, { kind: "student-placement" }>["placement"] }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#0D1B2A]/78 p-6">
      <p className="text-xs uppercase tracking-[0.18em] text-[#91A4B7]">Placement exam</p>
      <h2 className="mt-2 text-2xl font-semibold">{data.status === "completed" ? `Level ${data.finalLevel}` : data.status === "active" ? "Continue your exam" : "Ready when you are"}</h2>
      <p className="mt-3 text-sm leading-6 text-[#91A4B7]">
        {data.status === "completed"
          ? `Completed with ${data.answered} answered questions.`
          : data.status === "active"
            ? `${data.answered} answers saved. Continue from your latest question.`
            : "The adaptive exam estimates your CEFR level and unlocks speaking classes."}
      </p>
      <Link href={data.status === "completed" ? "/placement/result" : "/placement"} className="mt-6 inline-flex rounded-2xl bg-[#57D7FF] px-4 py-2 text-sm font-semibold text-[#07111F] outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#57D7FF]/70">
        {data.status === "completed" ? "View result" : data.status === "active" ? "Continue exam" : "Start exam"}
      </Link>
    </section>
  );
}

function StudentClassesPanel({ classes }: { classes: Extract<DashboardPageData, { kind: "student-classes" }>["classes"] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Classes</h2>
          <p className="mt-1 text-sm text-[#91A4B7]">Your AI speaking sessions.</p>
        </div>
        <Link href="/class" className="rounded-2xl bg-[#57D7FF] px-4 py-2 text-sm font-semibold text-[#07111F]">Open class</Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {classes.length ? classes.map((session) => (
          <article key={session.id} className="rounded-3xl border border-white/10 bg-[#0D1B2A]/78 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[#91A4B7]">Level {session.level}</p>
            <h3 className="mt-2 font-semibold">{session.subject ?? session.status.replace("-", " ")}</h3>
            <p className="mt-2 text-sm text-[#91A4B7]">{session.turnCount} turns · {session.status}</p>
            {session.status === "active" ? <Link href={`/class/${session.id}`} className="mt-4 inline-flex text-sm font-medium text-[#57D7FF]">Continue</Link> : null}
          </article>
        )) : (
          <p className="rounded-3xl border border-white/10 bg-[#0D1B2A]/78 p-6 text-sm text-[#91A4B7]">No classes yet.</p>
        )}
      </div>
    </div>
  );
}
