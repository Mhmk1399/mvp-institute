import Link from "next/link";

import { requireRole } from "@/lib/auth/guards";
import { getCompletedExamForUser } from "@/lib/services/exam";
import { getOpenClassForUser } from "@/lib/services/class";
import { prepareClassSubjectsAction } from "@/actions/class";
import { SubjectPicker } from "@/components/class/subject-picker";
import { LearningStage } from "@/components/learning/learning-stage";
import { SessionSidebar } from "@/components/learning/session-sidebar";

export default async function ClassEntryPage() {
  const user = await requireRole("student");

  const placement = await getCompletedExamForUser(user.id);
  if (!placement?.finalLevel) {
    return (
      <LearningStage
        eyebrow="Speaking class"
        title="Placement required"
        aside={<SessionSidebar title="Locked" meta="Complete placement first" />}
      >
        <p className="mb-6 text-sm text-[#91A4B7]">
          Complete your placement exam first to unlock speaking classes.
        </p>
        <Link
          href="/placement"
          className="rounded-2xl bg-[#57D7FF] px-5 py-2.5 text-sm font-semibold text-[#07111F] transition-opacity hover:opacity-90"
        >
          Go to placement
        </Link>
      </LearningStage>
    );
  }

  const open = await getOpenClassForUser(user.id);

  if (open?.status === "active") {
    return (
      <LearningStage
        eyebrow="Speaking class"
        title="Class in progress"
        active
        aside={<SessionSidebar title={open.subject ?? "Active class"} meta={`Level ${open.level}`} />}
      >
        <p className="mb-6 text-sm text-[#91A4B7]">You have a class in progress.</p>
        <Link
          href={`/class/${open.id}`}
          className="rounded-2xl bg-[#57D7FF] px-5 py-2.5 text-sm font-semibold text-[#07111F] transition-opacity hover:opacity-90"
        >
          Continue class
        </Link>
      </LearningStage>
    );
  }

  if (open?.status === "choosing-subject" && open.offeredSubjects.length === 4) {
    return (
      <LearningStage
        eyebrow="Choose focus"
        title="Choose a subject"
        aside={<SessionSidebar title="Speaking class" meta={`Level ${placement.finalLevel}`} />}
      >
        <p className="mb-8 text-sm text-[#91A4B7]">
          Pick a topic for your {placement.finalLevel} speaking class.
        </p>
        <SubjectPicker sessionId={open.id} subjects={open.offeredSubjects} />
      </LearningStage>
    );
  }

  async function prepare() {
    "use server";
    await prepareClassSubjectsAction();
  }

  return (
    <LearningStage
      eyebrow="Speaking class"
      title="Prepare subjects"
      aside={<SessionSidebar title="AI teacher" meta={`Level ${placement.finalLevel}`} />}
    >
      <p className="mb-6 text-sm leading-6 text-[#91A4B7]">
        Start a one-to-one class with an AI teacher tuned to your{" "}
        {placement.finalLevel} level. We&apos;ll suggest four subjects to choose from.
      </p>
      <form action={prepare}>
        <button
          type="submit"
          className="rounded-2xl bg-[#57D7FF] px-5 py-2.5 text-sm font-semibold text-[#07111F] transition-opacity hover:opacity-90"
        >
          Prepare subjects
        </button>
      </form>
    </LearningStage>
  );
}
