import type { AIMessage, PromptIdentity } from "@/lib/ai/types";
import type { ApprovedTeacherPlanV2 } from "@/lib/class/teacher-plan";

export const promptIdentity: PromptIdentity = { id: "class-reply", version: "v2" };

export interface ClassReplyV2Input {
  level: string;
  subject: string;
  studentMessage: string;
  recentTurns: string[];
  approvedPlan: ApprovedTeacherPlanV2;
}

function list(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "(none)";
}

export function buildMessages(input: ClassReplyV2Input): AIMessage[] {
  const plan = input.approvedPlan;
  const correctedForms = plan.corrections.map((correction) => correction.corrected);
  const teacherLines = plan.taught.map((item) => item.teacherLine);

  const systemLines = [
    "You are a supportive one-to-one English teacher writing the next reply.",
    "Follow the approved teaching move exactly. Never mention competency codes, evidence",
    "collection, mastery, or that the student 'passed' anything.",
    `Match CEFR level ${input.level} and stay on the subject "${input.subject}".`,
    `Use no more than ${plan.responsePlan.maximumReplySentences} sentences; let the student speak more than you.`,
    plan.responsePlan.correctionApproach === "none"
      ? "Do not correct the student this turn."
      : "Include the corrected expression naturally.",
    teacherLines.length ? "Include the teaching line when you teach the item." : "",
    plan.responsePlan.followUpQuestion ? "Ask exactly the one approved follow-up question." : "Do not ask a follow-up question.",
    plan.decision.languageMode === "english-with-brief-persian-support"
      ? "You may use at most 1–2 short Persian sentences to unblock the student; always give the English form, immediately return to English, and ask them to reuse it."
      : "Reply only in English.",
    "No markdown headings; avoid lists unless useful. Plain text only.",
  ];

  const userLines = [
    `Student said: ${input.studentMessage}`,
    `Recent turns:\n${list(input.recentTurns)}`,
    `Approved move: ${plan.decision.move}`,
    `Turn objective: ${plan.decision.turnObjective}`,
    `Correction approach: ${plan.responsePlan.correctionApproach}`,
    plan.responsePlan.acknowledgement ? `Acknowledgement: ${plan.responsePlan.acknowledgement}` : "",
    plan.responsePlan.teachingPoint ? `Teaching point: ${plan.responsePlan.teachingPoint}` : "",
    correctedForms.length ? `Corrected expression(s) to include: ${correctedForms.join("; ")}` : "",
    teacherLines.length ? `Teaching line to include: ${teacherLines.join("; ")}` : "",
    plan.responsePlan.followUpQuestion ? `Approved follow-up question: ${plan.responsePlan.followUpQuestion}` : "",
    "",
    "Write the teacher's reply now.",
  ];

  return [
    { role: "system", content: systemLines.filter(Boolean).join(" ") },
    { role: "user", content: userLines.filter(Boolean).join("\n") },
  ];
}
