import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="dashboard-bg flex min-h-dvh w-full flex-col items-center justify-center bg-[#07111F] px-6 py-16 text-center text-[#F3F8FF]">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">newinstitute</h1>
        <p className="mx-auto max-w-xl text-[#91A4B7]">
          Adaptive placement, focused curriculum, and one-to-one AI speaking classes.
        </p>
      </div>

      <div className="mt-8 flex gap-3">
        <Link
          href="/sign-in"
          className="rounded-2xl bg-[#57D7FF] px-5 py-2.5 text-sm font-semibold text-[#07111F] transition-opacity hover:opacity-90"
        >
          Sign in
        </Link>
        <Link
          href="/sign-up"
          className="rounded-2xl border border-white/15 px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-white/6"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}
