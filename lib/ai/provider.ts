import type { z } from "zod";

import type { AIChatOptions, AIChatResult, AIJSONResult } from "@/lib/ai/types";

/**
 * The contract every provider adapter implements. Application code depends only
 * on this interface, never on a concrete SDK. No state, prompts, MongoDB access,
 * or provider selection lives here. Streaming is out of scope for M1.
 */
export interface AIProvider {
  readonly name: string;

  chat(options: AIChatOptions): Promise<AIChatResult>;

  chatJSON<T>(
    options: AIChatOptions,
    schema: z.ZodType<T>,
  ): Promise<AIJSONResult<T>>;
}
