import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/session";
import { signOutAction } from "@/actions/auth";

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">newinstitute</h1>
        <p className="text-foreground/60">
          A clean start — Next.js, MongoDB (Mongoose) and a self-contained
          authentication system.
        </p>
      </div>

      {user ? (
        <div className="w-full space-y-4 rounded-2xl border border-black/10 p-6 dark:border-white/15">
          <p className="text-lg">
            Signed in as <span className="font-semibold">{user.name}</span>
          </p>
          <p className="text-sm text-foreground/60">{user.email}</p>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5 dark:border-white/20"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <div className="flex gap-3">
          <Link
            href="/sign-in"
            className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg border border-black/15 px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-foreground/5 dark:border-white/20"
          >
            Create account
          </Link>
        </div>
      )}
    </main>
  );
}
