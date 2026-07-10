import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { env } from "@/lib/env";
import { signJwt, verifyJwt } from "@/lib/auth/crypto";
import { connectToDatabase } from "@/lib/db/mongoose";
import { User, type Role } from "@/lib/models/user";

export const SESSION_COOKIE = "newinstitute_session";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/** Issue the signed session cookie. Call only from a Server Action. */
export async function setSessionCookie(userId: string): Promise<void> {
  const token = signJwt({ sub: userId }, env.authSecret, env.sessionMaxAgeSeconds);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: env.sessionMaxAgeSeconds,
  });
}

/** Clear the session cookie (sign-out). */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * The signed-in user, or null. React-cached so repeated calls in one render
 * hit the database once. Re-loads from Mongo each render, so deleting a user
 * revokes access even with a valid token.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = verifyJwt(token, env.authSecret);
  if (!payload) return null;

  await connectToDatabase();
  const user = await User.findById(payload.sub).lean();
  if (!user) return null;

  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
  };
});
