"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { selectClassSubjectAction } from "@/actions/class";
import type { OfferedSubjectDTO } from "@/lib/services/class";

export function SubjectPicker({
  sessionId,
  subjects,
}: {
  sessionId: string;
  subjects: OfferedSubjectDTO[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState<string>();

  async function choose(title: string) {
    if (pending) return;
    setPending(true);
    setSelected(title);
    setError(undefined);

    const result = await selectClassSubjectAction({ sessionId, subjectTitle: title });
    if (result.status === "success") {
      router.push(`/class/${result.sessionId}`);
      router.refresh();
      return;
    }
    setError(result.formError ?? "Could not select that subject.");
    setPending(false);
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-2xl bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {subjects.map((subject) => (
          <div
            key={subject.title}
            className="flex flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-5"
          >
            <h2 className="text-base font-semibold">{subject.title}</h2>
            <p className="mt-1 flex-1 text-sm leading-6 text-[#91A4B7]">{subject.description}</p>
            {subject.targetedGoals.length ? (
              <ul className="mt-3 space-y-1 text-xs text-[#91A4B7]">
                {subject.targetedGoals.map((goal) => (
                  <li key={goal}>{goal}</li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              onClick={() => choose(subject.title)}
              disabled={pending}
              className="mt-4 rounded-2xl bg-[#57D7FF] py-2 text-sm font-semibold text-[#07111F] transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending && selected === subject.title ? "Starting…" : "Choose"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
