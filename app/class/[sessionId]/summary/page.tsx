import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/guards";
import { getCompletedClassForUser } from "@/lib/services/class";

const ITEM_GROUPS: Array<{ type: "vocabulary" | "grammar" | "function"; label: string }> = [
  { type: "vocabulary", label: "Vocabulary" },
  { type: "grammar", label: "Grammar" },
  { type: "function", label: "Functions" },
];

export default async function ClassSummaryPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const user = await requireRole("student");

  const { sessionId } = await params;
  if (!/^[a-f\d]{24}$/i.test(sessionId)) notFound();

  const session = await getCompletedClassForUser(sessionId, user.id);
  if (!session || !session.finalSummary) notFound();

  const { finalSummary } = session;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">What you learned</h1>
      <p className="mt-1 text-sm text-foreground/60">
        {session.subject} · Level {session.level} · {session.turnCount}{" "}
        {session.turnCount === 1 ? "turn" : "turns"}
      </p>

      <section className="mt-8">
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{finalSummary.summary}</p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
          Learned items
        </h2>
        {ITEM_GROUPS.map((group) => {
          const items = finalSummary.learnedItems.filter((item) => item.type === group.type);
          if (items.length === 0) return null;
          return (
            <div key={group.type}>
              <h3 className="text-sm font-medium">{group.label}</h3>
              <ul className="mt-1 space-y-1 text-sm text-foreground/70">
                {items.map((item, index) => (
                  <li key={index}>• {item.item}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      {finalSummary.strengths.length ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
            Strengths
          </h2>
          <ul className="mt-1 space-y-1 text-sm text-foreground/70">
            {finalSummary.strengths.map((strength, index) => (
              <li key={index}>• {strength}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {finalSummary.nextSteps.length ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
            Next steps
          </h2>
          <ul className="mt-1 space-y-1 text-sm text-foreground/70">
            {finalSummary.nextSteps.map((step, index) => (
              <li key={index}>• {step}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-10">
        <Link
          href="/class"
          className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
        >
          Start another class
        </Link>
      </div>
    </main>
  );
}
