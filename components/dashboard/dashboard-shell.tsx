"use client";

import { useEffect, useState } from "react";

import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar, type DashboardNavItem } from "@/components/dashboard/dashboard-sidebar";
import { StudentDashboard } from "@/components/dashboard/student-dashboard";
import { TeacherDashboard } from "@/components/dashboard/teacher-dashboard";
import type { CurrentUser } from "@/lib/auth/session";
import { useDashboardData } from "@/lib/client/dashboard-cache";
import type { DashboardPageData } from "@/lib/dashboard/data";
import type { DashboardTab } from "@/lib/schemas/dashboard";

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
  initialTab,
  initialData,
}: {
  user: CurrentUser;
  initialTab: DashboardTab;
  initialData: DashboardPageData;
}) {
  const [currentTab, setCurrentTab] = useState(initialTab);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const items = NAV[user.role];
  const defaultTab = DEFAULT_TAB[user.role];
  const title = items.find((item) => item.tab === currentTab)?.label ?? "Dashboard";
  const { data, error, isLoading, isValidating, mutate } = useDashboardData({
    tab: currentTab,
    initialTab,
    initialData,
  });

  useEffect(() => {
    function syncTabFromHistory() {
      const rawTab = new URL(window.location.href).searchParams.get("tab");
      const tab = items.find((item) => item.tab === rawTab)?.tab ?? defaultTab;
      setCurrentTab(tab);
      setDrawerOpen(false);
    }

    window.addEventListener("popstate", syncTabFromHistory);
    return () => window.removeEventListener("popstate", syncTabFromHistory);
  }, [defaultTab, items]);

  function selectTab(tab: DashboardTab) {
    if (!items.some((item) => item.tab === tab)) return;
    setCurrentTab(tab);
    setDrawerOpen(false);
    window.history.pushState(null, "", `/dashboard?tab=${encodeURIComponent(tab)}`);
  }

  return (
    <div className="dashboard-bg min-h-dvh bg-[#07111F] text-[#F3F8FF]">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1480px]">
        <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-[#0D1B2A]/75 px-5 py-6 backdrop-blur md:block">
          <DashboardSidebar
            role={user.role}
            items={items}
            activeTab={currentTab}
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
                activeTab={currentTab}
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
            {isValidating && data ? (
              <p className="mb-3 text-xs text-[#91A4B7]" role="status">Refreshing…</p>
            ) : null}
            {error && !data ? (
              <div className="rounded-2xl border border-red-300/20 bg-red-950/20 p-5">
                <p className="text-sm text-red-100">Dashboard data could not be loaded.</p>
                <button
                  type="button"
                  className="mt-3 rounded-xl border border-white/15 px-3 py-2 text-sm font-medium hover:bg-white/5"
                  onClick={() => void mutate()}
                >
                  Retry
                </button>
              </div>
            ) : isLoading && !data ? (
              <p className="text-sm text-[#91A4B7]" role="status">Loading dashboard…</p>
            ) : data ? (
              user.role === "admin" ? (
                <AdminDashboard activeTab={currentTab} data={data} />
              ) : user.role === "teacher" ? (
                <TeacherDashboard activeTab={currentTab} data={data} />
              ) : (
                <StudentDashboard activeTab={currentTab} data={data} />
              )
            ) : null}
          </main>
        </section>
      </div>
    </div>
  );
}
