"use client";

import type { DashboardProfileDTO } from "@/lib/services/dashboard";

export function ProfilePanel({ profile }: { profile: DashboardProfileDTO | null }) {
  if (!profile) {
    return <p className="rounded-3xl border border-white/10 bg-[#0D1B2A]/78 p-6 text-sm text-[#91A4B7]">Profile unavailable.</p>;
  }

  const rows = [
    ["Name", profile.name],
    ["Email", profile.email],
    ["Role", profile.role],
    ["Status", profile.status],
    ["Placement", profile.placementStatus],
    ["CEFR level", profile.cefrLevel ?? "Not set"],
    ["Nickname", profile.nickname || "Not set"],
    ["Native language", profile.nativeLanguage || "Not set"],
  ];

  return (
    <section className="rounded-3xl border border-white/10 bg-[#0D1B2A]/78 p-5">
      <div className="mb-5 flex items-center gap-4">
        <div className="grid size-14 place-items-center rounded-2xl bg-[#57D7FF]/15 text-xl font-semibold text-[#57D7FF]">
          {profile.name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h2 className="text-lg font-semibold">{profile.name}</h2>
          <p className="text-sm text-[#91A4B7]">Member since {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "recently"}</p>
        </div>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <dt className="text-xs uppercase tracking-[0.16em] text-[#91A4B7]">{label}</dt>
            <dd className="mt-2 break-words text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
