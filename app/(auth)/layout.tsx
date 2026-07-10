import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Already signed in → no reason to see the auth screens.
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-8 text-center text-lg font-semibold tracking-tight">
        newinstitute
      </Link>
      <div className="rounded-2xl border border-black/10 p-6 dark:border-white/15">
        {children}
      </div>
    </div>
  );
}
