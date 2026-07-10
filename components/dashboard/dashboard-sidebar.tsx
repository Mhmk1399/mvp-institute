"use client";

import type { Role } from "@/lib/models/user";
import type { DashboardTab } from "@/lib/schemas/dashboard";

export interface DashboardNavItem {
  tab: DashboardTab;
  label: string;
}

export function DashboardSidebar({
  role,
  items,
  activeTab,
  onSelect,
}: {
  role: Role;
  items: DashboardNavItem[];
  activeTab: DashboardTab;
  onSelect: (tab: DashboardTab) => void;
}) {
  return (
    <nav className="flex h-full flex-col gap-6">
      <div>
        <p className="text-lg font-semibold tracking-tight text-[#F3F8FF]">newinstitute</p>
        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[#91A4B7]">{role}</p>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        {items.map((item) => (
          <button
            key={item.tab}
            type="button"
            aria-current={activeTab === item.tab ? "page" : undefined}
            onClick={() => onSelect(item.tab)}
            className="rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-[#91A4B7] outline-none transition hover:bg-white/6 hover:text-[#F3F8FF] focus-visible:ring-2 focus-visible:ring-[#57D7FF]/70 aria-current:bg-[#57D7FF]/12 aria-current:text-[#F3F8FF] aria-current:shadow-[0_0_24px_rgba(87,215,255,0.12)]"
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
