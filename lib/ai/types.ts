import type { AICallContext, AIMessage, AIUsage } from "@/lib/schemas/ai";

/**
 * Provider-neutral type surface for the AI layer. No provider SDK types leak
 * through here — adapters translate to and from these shapes.
 */
export type { AIMessage, AIUsage, AICallContext };

/** Stable identity for a versioned prompt template. */
export interface PromptIdentity {
  id: string;
  version: string;
}

export interface AIChatOptions {
  model: string;
  messages: AIMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  prompt?: PromptIdentity;
  context?: AICallContext;
}

interface AIResultBase {
  /** Normalized response text. */
  text: string;
  provider: string;
  model: string;
  usage?: AIUsage;
  /** Present when the call was persisted to the AICallLog collection. */
  logId?: string;
}

export type AIChatResult = AIResultBase;

export interface AIJSONResult<T> extends AIResultBase {
  data: T;
  repairAttempted: boolean;
}
