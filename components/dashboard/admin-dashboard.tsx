"use client";

import { CoursesPlaceholder } from "@/components/dashboard/courses-placeholder";
import { LevelsPanel } from "@/components/dashboard/levels-panel";
import { OverviewPanel } from "@/components/dashboard/overview-panel";
import { ProfilePanel } from "@/components/dashboard/profile-panel";
import { ReportsPanel } from "@/components/dashboard/reports-panel";
import { ReviewPanel } from "@/components/dashboard/review-panel";
import { UsersPanel } from "@/components/dashboard/users-panel";
import type { DashboardPageData } from "@/app/dashboard/page";
import type { DashboardTab } from "@/lib/schemas/dashboard";

export function AdminDashboard({ activeTab, data }: { activeTab: DashboardTab; data: DashboardPageData }) {
  if (activeTab === "levels" && data.kind === "levels") return <LevelsPanel levels={data.levels} role="admin" />;
  if (activeTab === "courses") return <CoursesPlaceholder />;
  if (activeTab === "exam-reviews" && data.kind === "reviews") return <ReviewPanel title="Exam Reviews" rows={data.rows} />;
  if (activeTab === "class-reviews" && data.kind === "reviews") return <ReviewPanel title="Class Reviews" rows={data.rows} />;
  if (activeTab === "reports" && data.kind === "reports") return <ReportsPanel reports={data.reports} />;
  if (activeTab === "users" && data.kind === "users") return <UsersPanel users={data.users} />;
  if (activeTab === "profile" && data.kind === "profile") return <ProfilePanel profile={data.profile} />;
  if (data.kind === "overview") return <OverviewPanel overview={data.overview} />;
  return null;
}
