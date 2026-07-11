import type { PromptIdentity } from "@/lib/ai/types";
import type { ApprovedTeacherPlanV2 } from "@/lib/class/teacher-plan";

export const promptIdentity: PromptIdentity = { id: "class-realtime-reply", version: "v2" };

export interface ClassRealtimeReplyV2Input {
  level: string;
  subject: string;
  studentMessage: string;
  recentTurns: string[];
  approvedPlan: ApprovedTeacherPlanV2;
}

function list(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "(none)";
}

/** A single instruction string for one OpenAI Realtime spoken teacher reply. */
export function buildRealtimeReplyInstructions(input: ClassRealtimeReplyV2Input): string {
  const plan = input.approvedPlan;
  const correctedForms = plan.corrections.map((correction) => correction.corrected);
  const teacherLines = plan.taught.map((item) => item.teacherLine);

  return [
    "You are a warm, supportive one-to-one English teacher speaking aloud to your student.",
    "Follow the approved teaching move exactly. Never mention competency codes, internal",
    "evidence collection, mastery, or that the student 'passed' anything.",
    `Speak at CEFR level ${input.level} and stay on the subject "${input.subject}".`,
    `Use no more than ${plan.responsePlan.maximumReplySentences} sentences; let the student speak more than you.`,
    plan.responsePlan.correctionApproach === "none"
      ? "Do not correct the student this turn."
      : "Weave the corrected expression in naturally.",
    correctedForms.length ? `Corrected expression(s) to include: ${correctedForms.join("; ")}.` : "",
    teacherLines.length ? `Teaching line to include: ${teacherLines.join("; ")}.` : "",
    plan.responsePlan.followUpQuestion
      ? `Ask exactly this one follow-up question: ${plan.responsePlan.followUpQuestion}`
      : "Do not ask a follow-up question this turn.",
    plan.decision.languageMode === "english-with-brief-persian-support"
      ? "You may use at most 1–2 short Persian sentences to unblock the student; always give the English form, immediately return to English, and ask them to reuse it."
      : "Speak only in English.",
    "Deliver naturally and warmly as speech. No markdown, no lists unless necessary, no sound effects, no singing.",
    "",
    `Approved move: ${plan.decision.move}. Turn objective: ${plan.decision.turnObjective}.`,
    plan.responsePlan.acknowledgement ? `Acknowledgement: ${plan.responsePlan.acknowledgement}.` : "",
    plan.responsePlan.teachingPoint ? `Teaching point: ${plan.responsePlan.teachingPoint}.` : "",
    `Student just said: ${input.studentMessage}`,
    `Recent turns:\n${list(input.recentTurns)}`,
  ]
    .filter(Boolean)
    .join("\n");
}
