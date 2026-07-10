import { z } from "zod";

/**
 * Reusable structured-output parsing with at most one repair retry. This file
 * is deliberately free of MongoDB, Mongoose, and OpenAI imports so it stays
 * pure and unit-testable; the repair step is injected by the caller.
 */

/** A human-readable, secret-free description of one validation failure. */
export interface SafeIssue {
  path: string;
  message: string;
}

/** Thrown when output cannot be validated even after one repair attempt. */
export class AIJSONParseError extends Error {
  readonly issues: SafeIssue[];
  readonly repairAttempted: boolean;

  constructor(message: string, issues: SafeIssue[], repairAttempted: boolean) {
    super(message);
    this.name = "AIJSONParseError";
    this.issues = issues;
    this.repairAttempted = repairAttempted;
  }
}

/** Produces the corrected raw text for one invalid response. */
export type RepairFn = (invalid: string, issues: SafeIssue[]) => Promise<string>;

function toSafeIssues(error: unknown): SafeIssue[] {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => ({
      path: issue.path.map(String).join(".") || "(root)",
      message: issue.message,
    }));
  }
  // A JSON syntax error carries no schema detail and no secrets.
  return [{ path: "(root)", message: "Response was not valid JSON" }];
}

/** Trim and strip a single surrounding ```json … ``` fence when present. */
function unfence(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  return (match ? match[1] : trimmed).trim();
}

function tryParse<T>(raw: string, schema: z.ZodType<T>): T {
  const parsed: unknown = JSON.parse(unfence(raw));
  return schema.parse(parsed);
}

/**
 * Parse and validate `raw` against `schema`. On failure, invoke `repair` exactly
 * once and re-validate. Throws {@link AIJSONParseError} if still invalid.
 */
export async function parseStructured<T>(
  raw: string,
  schema: z.ZodType<T>,
  repair: RepairFn,
): Promise<{ value: T; repairAttempted: boolean }> {
  try {
    return { value: tryParse(raw, schema), repairAttempted: false };
  } catch (firstError) {
    const issues = toSafeIssues(firstError);
    const repaired = await repair(raw, issues);
    try {
      return { value: tryParse(repaired, schema), repairAttempted: true };
    } catch (secondError) {
      throw new AIJSONParseError(
        "AI response failed schema validation after one repair attempt",
        toSafeIssues(secondError),
        true,
      );
    }
  }
}
