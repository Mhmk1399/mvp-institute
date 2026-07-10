import "server-only";

import { redirect } from "next/navigation";

import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import type { Role } from "@/lib/models/user";

/**
 * Route guards for Server Components / Server Actions. Both build on
 * getCurrentUser() (React-cached), so the user is loaded at most once per render.
 */

/** Require any signed-in user, or bounce to sign-in. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** Require one of `roles`; a signed-in user without an allowed role goes home. */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}
