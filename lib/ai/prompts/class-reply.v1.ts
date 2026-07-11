import type { AIMessage, PromptIdentity } from "@/lib/ai/types";
import type { ApprovedTeacherPlan } from "@/lib/class/teacher-plan";

export const promptIdentity: PromptIdentity = { id: "class-reply", version: "v1" };

export interface ClassReplyInput {
  level: string;
  subject: string;
  studentMessage: string;
  recentTurns: string[];
  approvedPlan: ApprovedTeacherPlan;
}

function list(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "(none)";
}

export function buildMessages(input: ClassReplyInput): AIMessage[] {
  const { approvedPlan: plan } = input;
  const correctedForms = plan.corrections.map((correction) => correction.corrected);
  const teacherLines = plan.taught.map((item) => item.teacherLine);

  const systemLines = [
    "You are a supportive one-to-one English teacher writing the next reply.",
    "Follow the approved teaching move exactly. Never mention the plan or any internal reasoning.",
    `Match CEFR level ${input.level} and stay on the subject "${input.subject}".`,
    `Use no more than ${plan.responsePlan.maximumReplySentences} sentences and let the student speak more than you.`,
    plan.responsePlan.correctionApproach === "none"
      ? "Do not correct the student this turn."
      : "Include the corrected expression naturally in your reply.",
    teacherLines.length ? "Include the teaching line when you teach the item." : "",
    plan.responsePlan.followUpQuestion
      ? "Ask exactly the one approved follow-up question."
      : "Do not ask a follow-up question this turn.",
    plan.decision.languageMode === "english-with-brief-persian-support"
      ? "You may use at most 1–2 short Persian sentences to unblock the student; always give the useful English expression, immediately return to English, and ask the student to reuse the English expression."
      : "Reply only in English.",
    "No markdown headings. Avoid bullet lists unless directly useful. Return plain text only.",
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
    plan.responsePlan.followUpQuestion
      ? `Approved follow-up question: ${plan.responsePlan.followUpQuestion}`
      : "",
    "",
    "Write the teacher's reply now.",
  ];

  return [
    { role: "system", content: systemLines.filter(Boolean).join(" ") },
    { role: "user", content: userLines.filter(Boolean).join("\n") },
  ];
}
