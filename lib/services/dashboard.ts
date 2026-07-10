import "server-only";

import { connectToDatabase } from "@/lib/db/mongoose";
import { ClassSession } from "@/lib/models/class-session";
import { ClassTurn } from "@/lib/models/class-turn";
import { ExamSession } from "@/lib/models/exam-session";
import { ExamTurn } from "@/lib/models/exam-turn";
import { User, type Role } from "@/lib/models/user";
import type { CEFRCode } from "@/lib/models/level";

export interface DashboardProfileDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  cefrLevel?: CEFRCode;
  placementStatus: "pending" | "completed";
  nativeLanguage: string;
  nickname: string;
  status: string;
  createdAt: string;
}

export interface OverviewDTO {
  totals: {
    users: number;
    students: number;
    teachers: number;
    completedExams: number;
    openClasses: number;
    completedClasses: number;
  };
  recentActivity: Array<{
    id: string;
    label: string;
    detail: string;
    at: string;
  }>;
}

export interface StudentHomeDTO {
  placementStatus: "pending" | "completed";
  cefrLevel?: CEFRCode;
  activeExamId?: string;
  openClassId?: string;
  openClassStatus?: "choosing-subject" | "active";
  completedClassCount: number;
  lastClassSubject?: string;
}

export interface StudentPlacementDTO {
  status: "not-started" | "active" | "completed";
  sessionId?: string;
  answered: number;
  finalLevel?: CEFRCode;
  completedAt?: string;
}

export interface StudentClassDTO {
  id: string;
  level: CEFRCode;
  status: "choosing-subject" | "active" | "completed" | "abandoned";
  subject?: string;
  turnCount: number;
  completedAt?: string;
  updatedAt: string;
}

export interface ReviewRowDTO {
  id: string;
  type: "exam" | "class";
  studentName: string;
  studentEmail: string;
  level?: CEFRCode;
  title: string;
  status: string;
  needsReview: boolean;
  score?: number;
  confidence?: number;
  createdAt: string;
  detail: {
    prompt: string;
    response: string;
    aiReply?: string;
    evidence: string[];
    strengths: string[];
    weaknesses: string[];
    corrections: Array<{
      original: string;
      corrected: string;
      explanation: string;
    }>;
  };
}

export interface ReportsDTO {
  placement: {
    active: number;
    completed: number;
    reviewNeeded: number;
  };
  classes: {
    choosing: number;
    active: number;
    completed: number;
    failedTurns: number;
  };
  levelDistribution: Array<{ level: CEFRCode; count: number }>;
}

export interface UserRowDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  placementStatus: "pending" | "completed";
  cefrLevel?: CEFRCode;
  createdAt: string;
}

type UserSummary = { name: string; email: string };

function id(value: unknown): string {
  return String(value);
}

function date(value: Date | string | undefined): string {
  return value ? new Date(value).toISOString() : "";
}

async function userMap(userIds: string[]): Promise<Map<string, UserSummary>> {
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return new Map();
  const users = await User.find({ _id: { $in: unique } })
    .select("name email")
    .lean<Array<{ _id: unknown; name: string; email: string }>>();
  return new Map(users.map((user) => [id(user._id), { name: user.name, email: user.email }]));
}

export async function getDashboardProfile(userId: string): Promise<DashboardProfileDTO | null> {
  await connectToDatabase();
  const user = await User.findById(userId)
    .select("name email role cefrLevel placementStatus nativelanguage nikname status createdAt")
    .lean<{
      _id: unknown;
      name: string;
      email: string;
      role: Role;
      cefrLevel?: CEFRCode;
      placementStatus: "pending" | "completed";
      nativelanguage?: string;
      nikname?: string;
      status?: string;
      createdAt?: Date;
    } | null>();
  if (!user) return null;
  return {
    id: id(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    cefrLevel: user.cefrLevel,
    placementStatus: user.placementStatus,
    nativeLanguage: user.nativelanguage ?? "",
    nickname: user.nikname ?? "",
    status: user.status ?? "active",
    createdAt: date(user.createdAt),
  };
}

export async function getOverview(): Promise<OverviewDTO> {
  await connectToDatabase();
  const [users, students, teachers, completedExams, openClasses, completedClasses, recentExams, recentClasses] =
    await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: "teacher" }),
      ExamSession.countDocuments({ status: "completed" }),
      ClassSession.countDocuments({ status: { $in: ["choosing-subject", "active"] } }),
      ClassSession.countDocuments({ status: "completed" }),
      ExamSession.find({ status: "completed" })
        .sort({ completedAt: -1, updatedAt: -1 })
        .limit(4)
        .select("userId finalLevel completedAt updatedAt")
        .lean<Array<{ _id: unknown; userId: unknown; finalLevel?: CEFRCode; completedAt?: Date; updatedAt?: Date }>>(),
      ClassSession.find({ status: "completed" })
        .sort({ completedAt: -1, updatedAt: -1 })
        .limit(4)
        .select("userId subject level completedAt updatedAt")
        .lean<Array<{ _id: unknown; userId: unknown; subject?: string; level: CEFRCode; completedAt?: Date; updatedAt?: Date }>>(),
    ]);

  const usersById = await userMap([
    ...recentExams.map((exam) => id(exam.userId)),
    ...recentClasses.map((session) => id(session.userId)),
  ]);
  const recentActivity = [
    ...recentExams.map((exam) => {
      const student = usersById.get(id(exam.userId));
      return {
        id: `exam-${id(exam._id)}`,
        label: "Placement completed",
        detail: `${student?.name ?? "Student"} reached ${exam.finalLevel ?? "a level"}`,
        at: date(exam.completedAt ?? exam.updatedAt),
      };
    }),
    ...recentClasses.map((session) => {
      const student = usersById.get(id(session.userId));
      return {
        id: `class-${id(session._id)}`,
        label: "Class completed",
        detail: `${student?.name ?? "Student"} finished ${session.subject ?? session.level}`,
        at: date(session.completedAt ?? session.updatedAt),
      };
    }),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);

  return {
    totals: { users, students, teachers, completedExams, openClasses, completedClasses },
    recentActivity,
  };
}

export async function getStudentHome(userId: string): Promise<StudentHomeDTO> {
  await connectToDatabase();
  const [user, activeExam, openClass, completedClasses] = await Promise.all([
    User.findById(userId)
      .select("cefrLevel placementStatus")
      .lean<{ cefrLevel?: CEFRCode; placementStatus: "pending" | "completed" } | null>(),
    ExamSession.findOne({ userId, status: "active" }).select("_id").lean<{ _id: unknown } | null>(),
    ClassSession.findOne({ userId, status: { $in: ["choosing-subject", "active"] } })
      .select("_id status subject")
      .lean<{ _id: unknown; status: "choosing-subject" | "active"; subject?: string } | null>(),
    ClassSession.find({ userId, status: "completed" })
      .sort({ completedAt: -1 })
      .limit(1)
      .select("subject")
      .lean<Array<{ subject?: string }>>(),
  ]);
  const completedClassCount = await ClassSession.countDocuments({ userId, status: "completed" });
  return {
    placementStatus: user?.placementStatus ?? "pending",
    cefrLevel: user?.cefrLevel,
    activeExamId: activeExam ? id(activeExam._id) : undefined,
    openClassId: openClass ? id(openClass._id) : undefined,
    openClassStatus: openClass?.status,
    completedClassCount,
    lastClassSubject: completedClasses[0]?.subject,
  };
}

export async function getStudentPlacement(userId: string): Promise<StudentPlacementDTO> {
  await connectToDatabase();
  const completed = await ExamSession.findOne({ userId, status: "completed" })
    .sort({ completedAt: -1, updatedAt: -1 })
    .select("_id turnCount finalLevel completedAt")
    .lean<{ _id: unknown; turnCount: number; finalLevel?: CEFRCode; completedAt?: Date } | null>();
  if (completed) {
    return {
      status: "completed",
      sessionId: id(completed._id),
      answered: completed.turnCount,
      finalLevel: completed.finalLevel,
      completedAt: date(completed.completedAt),
    };
  }
  const active = await ExamSession.findOne({ userId, status: "active" })
    .select("_id turnCount")
    .lean<{ _id: unknown; turnCount: number } | null>();
  if (active) return { status: "active", sessionId: id(active._id), answered: active.turnCount };
  return { status: "not-started", answered: 0 };
}

export async function getStudentClasses(userId: string): Promise<StudentClassDTO[]> {
  await connectToDatabase();
  const sessions = await ClassSession.find({ userId })
    .sort({ updatedAt: -1 })
    .limit(12)
    .select("level status subject turnCount completedAt updatedAt")
    .lean<
      Array<{
        _id: unknown;
        level: CEFRCode;
        status: StudentClassDTO["status"];
        subject?: string;
        turnCount: number;
        completedAt?: Date;
        updatedAt?: Date;
      }>
    >();
  return sessions.map((session) => ({
    id: id(session._id),
    level: session.level,
    status: session.status,
    subject: session.subject,
    turnCount: session.turnCount,
    completedAt: date(session.completedAt),
    updatedAt: date(session.updatedAt),
  }));
}

export async function getExamReviews(limit = 40): Promise<ReviewRowDTO[]> {
  await connectToDatabase();
  const turns = await ExamTurn.find({ status: "scored" })
    .sort({ needsTeacherReview: -1, updatedAt: -1 })
    .limit(limit)
    .select("userId targetLevel question studentAnswer aiScore confidence needsTeacherReview updatedAt")
    .lean<
      Array<{
        _id: unknown;
        userId: unknown;
        targetLevel: CEFRCode;
        question: string;
        studentAnswer?: string;
        aiScore?: {
          overallScore: number;
          evidence?: string[];
          strengths?: string[];
          weaknesses?: string[];
        };
        confidence?: number;
        needsTeacherReview: boolean;
        updatedAt?: Date;
      }>
    >();
  const usersById = await userMap(turns.map((turn) => id(turn.userId)));
  return turns.map((turn) => {
    const student = usersById.get(id(turn.userId));
    return {
      id: id(turn._id),
      type: "exam",
      studentName: student?.name ?? "Student",
      studentEmail: student?.email ?? "",
      level: turn.targetLevel,
      title: turn.question,
      status: turn.needsTeacherReview ? "Needs review" : "Scored",
      needsReview: turn.needsTeacherReview,
      score: turn.aiScore?.overallScore,
      confidence: turn.confidence,
      createdAt: date(turn.updatedAt),
      detail: {
        prompt: turn.question,
        response: turn.studentAnswer ?? "",
        evidence: turn.aiScore?.evidence ?? [],
        strengths: turn.aiScore?.strengths ?? [],
        weaknesses: turn.aiScore?.weaknesses ?? [],
        corrections: [],
      },
    };
  });
}

export async function getClassReviews(limit = 40): Promise<ReviewRowDTO[]> {
  await connectToDatabase();
  const turns = await ClassTurn.find({ status: "completed" })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select("sessionId userId studentMessage aiMessage corrections taughtInThisTurn updatedAt")
    .lean<
      Array<{
        _id: unknown;
        sessionId: unknown;
        userId: unknown;
        studentMessage: string;
        aiMessage?: string;
        corrections?: Array<{ original: string; corrected: string; explanation: string }>;
        taughtInThisTurn?: Array<{ item: string; evidence: string }>;
        updatedAt?: Date;
      }>
    >();
  const [usersById, sessions] = await Promise.all([
    userMap(turns.map((turn) => id(turn.userId))),
    ClassSession.find({ _id: { $in: turns.map((turn) => id(turn.sessionId)) } })
      .select("level subject")
      .lean<Array<{ _id: unknown; level: CEFRCode; subject?: string }>>(),
  ]);
  const sessionsById = new Map(sessions.map((session) => [id(session._id), session]));
  return turns.map((turn) => {
    const student = usersById.get(id(turn.userId));
    const session = sessionsById.get(id(turn.sessionId));
    const corrections = turn.corrections ?? [];
    return {
      id: id(turn._id),
      type: "class",
      studentName: student?.name ?? "Student",
      studentEmail: student?.email ?? "",
      level: session?.level,
      title: session?.subject ?? "Speaking class",
      status: corrections.length ? "Corrections" : "Completed",
      needsReview: corrections.length > 0,
      createdAt: date(turn.updatedAt),
      detail: {
        prompt: turn.studentMessage,
        response: turn.studentMessage,
        aiReply: turn.aiMessage ?? "",
        evidence: (turn.taughtInThisTurn ?? []).map((item) => `${item.item}: ${item.evidence}`),
        strengths: [],
        weaknesses: [],
        corrections,
      },
    };
  });
}

export async function getReports(): Promise<ReportsDTO> {
  await connectToDatabase();
  const [active, completed, reviewNeeded, choosing, classActive, classCompleted, failedTurns, levels] =
    await Promise.all([
      ExamSession.countDocuments({ status: "active" }),
      ExamSession.countDocuments({ status: "completed" }),
      ExamTurn.countDocuments({ needsTeacherReview: true }),
      ClassSession.countDocuments({ status: "choosing-subject" }),
      ClassSession.countDocuments({ status: "active" }),
      ClassSession.countDocuments({ status: "completed" }),
      ClassTurn.countDocuments({ status: "failed" }),
      User.aggregate<{ _id: CEFRCode; count: number }>([
        { $match: { role: "student", cefrLevel: { $exists: true } } },
        { $group: { _id: "$cefrLevel", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);
  return {
    placement: { active, completed, reviewNeeded },
    classes: { choosing, active: classActive, completed: classCompleted, failedTurns },
    levelDistribution: levels.map((level) => ({ level: level._id, count: level.count })),
  };
}

export async function getUsers(limit = 80): Promise<UserRowDTO[]> {
  await connectToDatabase();
  const users = await User.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("name email role status placementStatus cefrLevel createdAt")
    .lean<
      Array<{
        _id: unknown;
        name: string;
        email: string;
        role: Role;
        status?: string;
        placementStatus: "pending" | "completed";
        cefrLevel?: CEFRCode;
        createdAt?: Date;
      }>
    >();
  return users.map((user) => ({
    id: id(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status ?? "active",
    placementStatus: user.placementStatus,
    cefrLevel: user.cefrLevel,
    createdAt: date(user.createdAt),
  }));
}
