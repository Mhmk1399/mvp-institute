import "server-only";

import { env } from "@/lib/env";
import type { AIProvider } from "@/lib/ai/provider";
import { OpenAIProvider } from "@/lib/ai/providers/openai";

/**
 * Provider selection and caching. Application code calls getAIProvider() and
 * never touches a concrete SDK. Provider imports are server-only, and the raw
 * OpenAI client is never exported.
 */
let cached: AIProvider | undefined;

export function getAIProvider(): AIProvider {
  if (cached) return cached;

  switch (env.aiProvider) {
    case "openai":
      cached = new OpenAIProvider();
      return cached;
    default:
      throw new Error(`Unsupported AI_PROVIDER: ${String(env.aiProvider)}`);
  }
}
