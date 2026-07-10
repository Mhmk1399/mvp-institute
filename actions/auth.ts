"use server";

import { redirect } from "next/navigation";

import { connectToDatabase } from "@/lib/db/mongoose";
import { User } from "@/lib/models/user";
import { hashPassword, verifyPassword } from "@/lib/auth/crypto";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth/session";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";

export type AuthResult =
  | { status: "success" }
  | { status: "error"; formError?: string; fieldErrors?: Record<string, string[]> };

const GENERIC_SIGNUP_ERROR = "We couldn't create your account. Please try again.";
const GENERIC_SIGNIN_ERROR = "Invalid email or password.";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

/** Register a new user and sign them in. */
export async function signUpAction(raw: unknown): Promise<AuthResult> {
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { name, email, password } = parsed.data;

  await connectToDatabase();

  // Cheap pre-check for a friendly message; the unique index is the real guard.
  const existing = await User.findOne({ email }).lean();
  if (existing) {
    return { status: "error", fieldErrors: { email: ["That email is already registered"] } };
  }

  let userId: string;
  try {
    // role is always "student" — never sourced from client input.
    const user = await User.create({
      name,
      email,
      passwordHash: hashPassword(password),
      role: "student",
    });
    userId = String(user._id);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return { status: "error", fieldErrors: { email: ["That email is already registered"] } };
    }
    return { status: "error", formError: GENERIC_SIGNUP_ERROR };
  }

  await setSessionCookie(userId);
  return { status: "success" };
}

/** Sign in with email + password. Generic error (no account enumeration). */
export async function signInAction(raw: unknown): Promise<AuthResult> {
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", formError: GENERIC_SIGNIN_ERROR };
  }
  const { email, password } = parsed.data;

  await connectToDatabase();
  const user = await User.findOne({ email });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { status: "error", formError: GENERIC_SIGNIN_ERROR };
  }

  await setSessionCookie(String(user._id));
  return { status: "success" };
}

/** Sign out and return to the home page. */
export async function signOutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/");
}
