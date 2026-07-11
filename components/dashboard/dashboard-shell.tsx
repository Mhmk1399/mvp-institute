"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar, type DashboardNavItem } from "@/components/dashboard/dashboard-sidebar";
import { StudentDashboard } from "@/components/dashboard/student-dashboard";
import { TeacherDashboard } from "@/components/dashboard/teacher-dashboard";
import type { CurrentUser } from "@/lib/auth/session";
import type { DashboardTab } from "@/lib/schemas/dashboard";
import type { DashboardPageData } from "@/app/dashboard/page";

const NAV: Record<string, DashboardNavItem[]> = {
  admin: [
    { tab: "overview", label: "Overview" },
    { tab: "levels", label: "Levels & Curriculum" },
    { tab: "courses", label: "Courses" },
    { tab: "exam-reviews", label: "Exam Reviews" },
    { tab: "class-reviews", label: "Class Reviews" },
    { tab: "reports", label: "Reports" },
    { tab: "users", label: "Users" },
    { tab: "profile", label: "Profile" },
  ],
  teacher: [
    { tab: "overview", label: "Overview" },
    { tab: "levels", label: "Levels & Curriculum" },
    { tab: "courses", label: "Courses" },
    { tab: "exam-reviews", label: "Exam Reviews" },
    { tab: "class-reviews", label: "Class Reviews" },
    { tab: "reports", label: "Reports" },
    { tab: "profile", label: "Profile" },
  ],
  student: [
    { tab: "home", label: "Home" },
    { tab: "placement", label: "Placement Exam" },
    { tab: "classes", label: "Classes" },
    { tab: "profile", label: "Profile" },
  ],
};

const DEFAULT_TAB: Record<string, DashboardTab> = {
  admin: "overview",
  teacher: "overview",
  student: "home",
};

export function DashboardShell({
  user,
  activeTab,
  data,
}: {
  user: CurrentUser;
  activeTab: DashboardTab;
  data: DashboardPageData;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const items = NAV[user.role];
  const defaultTab = DEFAULT_TAB[user.role];
  const title = items.find((item) => item.tab === activeTab)?.label ?? "Dashboard";

  const queryPrefix = useMemo(() => searchParams.toString(), [searchParams]);

  function selectTab(tab: DashboardTab) {
    const params = new URLSearchParams(queryPrefix);
    params.set("tab", tab);
    setDrawerOpen(false);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="dashboard-bg min-h-dvh bg-[#07111F] text-[#F3F8FF]">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1480px]">
        <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-[#0D1B2A]/75 px-5 py-6 backdrop-blur md:block">
          <DashboardSidebar
            role={user.role}
            items={items}
            activeTab={activeTab}
            defaultTab={defaultTab}
            onSelect={selectTab}
          />
        </aside>

        {drawerOpen ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/55"
              onClick={() => setDrawerOpen(false)}
            />
            <aside className="relative h-full w-80 max-w-[86vw] border-r border-white/10 bg-[#0D1B2A] px-5 py-6 shadow-2xl">
              <DashboardSidebar
                role={user.role}
                items={items}
                activeTab={activeTab}
                defaultTab={defaultTab}
                onSelect={selectTab}
                onNavigateHome={() => setDrawerOpen(false)}
              />
            </aside>
          </div>
        ) : null}

        <section className="flex min-w-0 flex-1 flex-col">
          <DashboardHeader user={user} title={title} onMenu={() => setDrawerOpen(true)} />
          <main className="min-w-0 flex-1 px-4 py-5 md:px-7 md:py-7">
            {user.role === "admin" ? (
              <AdminDashboard activeTab={activeTab} data={data} />
            ) : user.role === "teacher" ? (
              <TeacherDashboard activeTab={activeTab} data={data} />
            ) : (
              <StudentDashboard activeTab={activeTab} data={data} />
            )}
          </main>
        </section>
      </div>
    </div>
  );
}
