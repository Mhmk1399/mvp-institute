"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/guards";
import { createLevelSchema, updateLevelSchema } from "@/lib/schemas/level";
import { createLevel, updateLevel, LevelConflictError } from "@/lib/services/level";

export type LevelActionResult =
  | { status: "success" }
  | { status: "error"; formError?: string; fieldErrors?: Record<string, string[]> };

const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Create a new CEFR level. Admins only. */
export async function createLevelAction(raw: unknown): Promise<LevelActionResult> {
  const user = await requireRole("admin");

  const parsed = createLevelSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await createLevel(parsed.data, user.id);
  } catch (error) {
    if (error instanceof LevelConflictError) {
      return { status: "error", fieldErrors: { code: ["That level already exists"] } };
    }
    return { status: "error", formError: GENERIC_ERROR };
  }

  revalidatePath("/admin/levels");
  revalidatePath(`/admin/levels/${parsed.data.code}`);
  return { status: "success" };
}

/** Update an existing level's content and status. Admins or teachers. */
export async function updateLevelAction(
  code: string,
  raw: unknown,
): Promise<LevelActionResult> {
  const user = await requireRole("admin", "teacher");

  const parsed = updateLevelSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const updated = await updateLevel(code, parsed.data, user.id);
    if (!updated) {
      return { status: "error", formError: "That level no longer exists." };
    }
  } catch {
    return { status: "error", formError: GENERIC_ERROR };
  }

  revalidatePath("/admin/levels");
  revalidatePath(`/admin/levels/${code}`);
  return { status: "success" };
}
