import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireUser } from "@/lib/auth/guards";
import type { Role } from "@/lib/models/user";
import {
  adminDashboardTabSchema,
  studentDashboardTabSchema,
  teacherDashboardTabSchema,
  type DashboardTab,
} from "@/lib/schemas/dashboard";
import {
  getClassReviews,
  getDashboardProfile,
  getExamReviews,
  getOverview,
  getReports,
  getStudentClasses,
  getStudentHome,
  getStudentPlacement,
  getUsers,
  type DashboardProfileDTO,
  type OverviewDTO,
  type ReportsDTO,
  type ReviewRowDTO,
  type StudentClassDTO,
  type StudentHomeDTO,
  type StudentPlacementDTO,
  type UserRowDTO,
} from "@/lib/services/dashboard";
import { listLevels, type LevelDTO } from "@/lib/services/level";

export type DashboardPageData =
  | { kind: "overview"; overview: OverviewDTO }
  | { kind: "levels"; levels: LevelDTO[] }
  | { kind: "courses" }
  | { kind: "reviews"; rows: ReviewRowDTO[] }
  | { kind: "reports"; reports: ReportsDTO }
  | { kind: "users"; users: UserRowDTO[] }
  | { kind: "profile"; profile: DashboardProfileDTO | null }
  | { kind: "student-home"; home: StudentHomeDTO }
  | { kind: "student-placement"; placement: StudentPlacementDTO }
  | { kind: "student-classes"; classes: StudentClassDTO[] };

const DEFAULT_TAB: Record<Role, DashboardTab> = {
  admin: "overview",
  teacher: "overview",
  student: "home",
};

function safeTab(role: Role, raw: unknown): DashboardTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const schema =
    role === "admin"
      ? adminDashboardTabSchema
      : role === "teacher"
        ? teacherDashboardTabSchema
        : studentDashboardTabSchema;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_TAB[role];
}

async function loadTabData(role: Role, userId: string, tab: DashboardTab): Promise<DashboardPageData> {
  if (tab === "levels") return { kind: "levels", levels: await listLevels() };
  if (tab === "courses") return { kind: "courses" };
  if (tab === "profile") return { kind: "profile", profile: await getDashboardProfile(userId) };

  if (role === "student") {
    if (tab === "placement") return { kind: "student-placement", placement: await getStudentPlacement(userId) };
    if (tab === "classes") return { kind: "student-classes", classes: await getStudentClasses(userId) };
    return { kind: "student-home", home: await getStudentHome(userId) };
  }

  if (tab === "exam-reviews") return { kind: "reviews", rows: await getExamReviews() };
  if (tab === "class-reviews") return { kind: "reviews", rows: await getClassReviews() };
  if (tab === "reports") return { kind: "reports", reports: await getReports() };
  if (role === "admin" && tab === "users") return { kind: "users", users: await getUsers() };
  return { kind: "overview", overview: await getOverview() };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const activeTab = safeTab(user.role, params.tab);

  if (params.tab !== undefined && activeTab !== (Array.isArray(params.tab) ? params.tab[0] : params.tab)) {
    redirect(`/dashboard?tab=${activeTab}`);
  }

  const data = await loadTabData(user.role, user.id, activeTab);
  return <DashboardShell user={user} activeTab={activeTab} data={data} />;
}
