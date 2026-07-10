import { notFound, redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/guards";
import { getClassByIdForUser, getRecentClassTurns } from "@/lib/services/class";
import { completeClassAction } from "@/actions/class";
import { ClassChat, type ChatMessage } from "@/components/class/class-chat";
import { LearningStage } from "@/components/learning/learning-stage";
import { SessionSidebar } from "@/components/learning/session-sidebar";

export default async function ClassSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const user = await requireRole("student");

  const { sessionId } = await params;
  if (!/^[a-f\d]{24}$/i.test(sessionId)) notFound();

  const session = await getClassByIdForUser(sessionId, user.id);
  if (!session) notFound();
  if (session.status === "completed") redirect(`/class/${sessionId}/summary`);
  if (session.status !== "active") redirect("/class");

  const recent = await getRecentClassTurns(sessionId, 8);
  const history: ChatMessage[] = recent.flatMap((turn) => {
    const items: ChatMessage[] = [{ role: "student", text: turn.studentMessage }];
    if (turn.aiMessage) items.push({ role: "teacher", text: turn.aiMessage });
    return items;
  });

  async function endClass() {
    "use server";
    const result = await completeClassAction({ sessionId });
    if (result.status === "success") redirect(result.summaryPath);
  }

  return (
    <LearningStage
      eyebrow={`Level ${session.level} speaking class`}
      title={session.subject ?? "Speaking class"}
      active
      aside={
        <SessionSidebar title={session.subject ?? "Speaking class"} meta={`${session.turnCount} completed turns`}>
          {session.targetedGoals.slice(0, 5).map((goal) => (
            <p key={goal} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-sm text-[#91A4B7]">
              {goal}
            </p>
          ))}
          <form action={endClass}>
            <button
              type="submit"
              className="w-full rounded-2xl border border-white/12 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/6"
            >
              End class
            </button>
          </form>
        </SessionSidebar>
      }
    >
      <div className="min-h-0">
        <form action={endClass}>
          <button
            type="submit"
            className="mb-4 rounded-2xl border border-white/12 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/6 lg:hidden"
          >
            End class
          </button>
        </form>
        <ClassChat sessionId={sessionId} initialHistory={history} />
      </div>
    </LearningStage>
  );
}
