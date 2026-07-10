import { z } from "zod";

export const adminDashboardTabSchema = z.enum([
  "overview",
  "levels",
  "courses",
  "exam-reviews",
  "class-reviews",
  "reports",
  "users",
  "profile",
]);

export const teacherDashboardTabSchema = z.enum([
  "overview",
  "levels",
  "courses",
  "exam-reviews",
  "class-reviews",
  "reports",
  "profile",
]);

export const studentDashboardTabSchema = z.enum([
  "home",
  "placement",
  "classes",
  "profile",
]);

export const dashboardTabSchema = z.union([
  adminDashboardTabSchema,
  teacherDashboardTabSchema,
  studentDashboardTabSchema,
]);

export type AdminDashboardTab = z.infer<typeof adminDashboardTabSchema>;
export type TeacherDashboardTab = z.infer<typeof teacherDashboardTabSchema>;
export type StudentDashboardTab = z.infer<typeof studentDashboardTabSchema>;
export type DashboardTab = z.infer<typeof dashboardTabSchema>;
