"use server";

import { requireRole } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { getAIProvider } from "@/lib/ai/client";
import {
  promptIdentity as subjectPromptIdentity,
  buildMessages as buildSubjectMessages,
  subjectPickerOutputSchema,
} from "@/lib/ai/prompts/subject-picker.v1";
import {
  promptIdentity as summaryPromptIdentity,
  buildMessages as buildSummaryMessages,
  sessionSummaryOutputSchema,
} from "@/lib/ai/prompts/session-summary.v1";
import { selectSubjectSchema, completeClassSchema } from "@/lib/schemas/class";
import { listLevels } from "@/lib/services/level";
import { getCompletedExamForUser } from "@/lib/services/exam";
import {
  activateClass,
  createChoosingSession,
  getClassByIdForUser,
  getOpenClassForUser,
  listClassTurns,
  listPreviousSubjects,
  saveOfferedSubjects,
  completeClassSession,
  type OfferedSubjectDTO,
} from "@/lib/services/class";

export type PrepareSubjectsResult =
  | { status: "choosing"; sessionId: string; subjects: OfferedSubjectDTO[] }
  | { status: "active"; sessionId: string }
  | { status: "placement-required" }
  | { status: "error"; formError: string };

export type SelectSubjectResult =
  | { status: "success"; sessionId: string }
  | { status: "error"; formError?: string; fieldErrors?: Record<string, string[]> };

export type CompleteClassResult =
  | { status: "success"; summaryPath: string }
  | { status: "error"; formError?: string; fieldErrors?: Record<string, string[]>; retryable?: boolean };

function flattenGoals(goals: {
  grammar: string[];
  vocabulary: string[];
  functions: string[];
}): string[] {
  return [...goals.grammar, ...goals.vocabulary, ...goals.functions];
}

export async function prepareClassSubjectsAction(): Promise<PrepareSubjectsResult> {
  const user = await requireRole("student");

  // Placement is proven by a completed exam; its final level is the CEFR level.
  const placement = await getCompletedExamForUser(user.id);
  if (!placement?.finalLevel) return { status: "placement-required" };
  const level = placement.finalLevel;

  let session = await getOpenClassForUser(user.id);
  if (session?.status === "active") {
    return { status: "active", sessionId: session.id };
  }
  if (!session) {
    session = await createChoosingSession({ userId: user.id, level });
  }

  // Reuse already-offered subjects; never regenerate on refresh.
  if (session.offeredSubjects.length === 4) {
    return { status: "choosing", sessionId: session.id, subjects: session.offeredSubjects };
  }

  const levels = await listLevels();
  const levelContent = levels.find((entry) => entry.code === level && entry.isActive);
  const goals = levelContent ? flattenGoals(levelContent.goals) : [];
  if (goals.length === 0) {
    return { status: "error", formError: "Your level has no curriculum yet." };
  }

  const previousSubjects = await listPreviousSubjects(user.id, 20);

  try {
    const result = await getAIProvider().chatJSON(
      {
        model: env.aiGenerationModel,
        messages: buildSubjectMessages({ level, goals, previousSubjects }),
        prompt: subjectPromptIdentity,
        context: { userId: user.id, sessionId: session.id },
      },
      subjectPickerOutputSchema,
    );
    await saveOfferedSubjects({
      sessionId: session.id,
      userId: user.id,
      offeredSubjects: result.data.subjects,
      subjectPickerAiCallId: result.logId,
    });
    return { status: "choosing", sessionId: session.id, subjects: result.data.subjects };
  } catch {
    return { status: "error", formError: "Could not prepare subjects. Please try again." };
  }
}

export async function selectClassSubjectAction(
  input: unknown,
): Promise<SelectSubjectResult> {
  const user = await requireRole("student");

  const parsed = selectSubjectSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { sessionId, subjectTitle } = parsed.data;

  const session = await getClassByIdForUser(sessionId, user.id);
  if (!session) return { status: "error", formError: "Class not found." };
  if (session.status !== "choosing-subject") {
    return { status: "error", formError: "This class has already started." };
  }

  const offered = session.offeredSubjects.find((subject) => subject.title === subjectTitle);
  if (!offered) return { status: "error", formError: "Please choose one of the offered subjects." };

  const activated = await activateClass({
    sessionId,
    userId: user.id,
    subject: offered.title,
    targetedGoals: offered.targetedGoals,
  });
  if (!activated) return { status: "error", formError: "Could not start the class." };

  return { status: "success", sessionId };
}

export async function completeClassAction(input: unknown): Promise<CompleteClassResult> {
  const user = await requireRole("student");

  const parsed = completeClassSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { sessionId } = parsed.data;

  const session = await getClassByIdForUser(sessionId, user.id);
  if (!session) return { status: "error", formError: "Class not found." };
  if (session.status === "completed") {
    return { status: "success", summaryPath: `/class/${sessionId}/summary` };
  }
  if (session.status !== "active") {
    return { status: "error", formError: "This class is not active." };
  }

  const turns = await listClassTurns(sessionId);
  const completedTurns = turns.filter((turn) => turn.status === "completed");
  if (completedTurns.length === 0) {
    return { status: "error", formError: "Send at least one message before ending the class." };
  }

  const levels = await listLevels();
  const levelContent = levels.find((entry) => entry.code === session.level);
  const goals = levelContent ? flattenGoals(levelContent.goals) : [];

  const recentTurns = completedTurns
    .slice(-20)
    .map((turn) => `Student: ${turn.studentMessage}\nTeacher: ${turn.aiMessage ?? ""}`);

  try {
    const result = await getAIProvider().chatJSON(
      {
        model: env.aiGenerationModel,
        messages: buildSummaryMessages({
          level: session.level,
          subject: session.subject ?? "",
          goals,
          recentTurns,
          runningSummary: session.runningSummary,
        }),
        prompt: summaryPromptIdentity,
        context: { userId: user.id, sessionId },
      },
      sessionSummaryOutputSchema,
    );
    await completeClassSession({
      sessionId,
      userId: user.id,
      finalSummary: result.data,
      summaryAiCallId: result.logId,
    });
    return { status: "success", summaryPath: `/class/${sessionId}/summary` };
  } catch {
    return {
      status: "error",
      formError: "Could not generate your summary. Please try again.",
      retryable: true,
    };
  }
}
