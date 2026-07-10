import "server-only";

import OpenAI, { APIError } from "openai";
import type { z } from "zod";

import { env } from "@/lib/env";
import type { AIProvider } from "@/lib/ai/provider";
import type {
  AIChatOptions,
  AIChatResult,
  AIJSONResult,
  AIMessage,
  AIUsage,
} from "@/lib/ai/types";
import { AIJSONParseError, parseStructured, type SafeIssue } from "@/lib/ai/json";
import { logAICall } from "@/lib/ai/logger";

/** A provider failure with only secret-free fields retained. */
export class AIProviderError extends Error {
  readonly code?: string;

  constructor(message: string, name: string, code?: string) {
    super(message);
    this.name = name || "AIProviderError";
    this.code = code;
  }
}

function toProviderError(error: unknown): AIProviderError {
  if (error instanceof APIError) {
    return new AIProviderError(error.message, error.name ?? "APIError", error.code ?? undefined);
  }
  if (error instanceof Error) {
    return new AIProviderError(error.message, error.name);
  }
  return new AIProviderError("Unknown provider error", "AIProviderError");
}

function buildRepairInstruction(issues: SafeIssue[]): string {
  const problems = issues.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n");
  return [
    "Your previous response was not valid JSON matching the required schema.",
    "Problems:",
    problems,
    "Return ONLY the corrected JSON object. No markdown, no code fences, no commentary.",
  ].join("\n");
}

function hasUsage(usage: AIUsage): boolean {
  return (
    usage.inputTokens !== undefined ||
    usage.outputTokens !== undefined ||
    usage.totalTokens !== undefined
  );
}

/**
 * OpenAI adapter. The SDK client stays private to this module — no OpenAI type
 * or response object is exposed to callers, and the API key is never logged or
 * returned. Exam/class/CEFR logic lives in prompt modules, not here.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  private readonly client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: env.openaiApiKey });
  }

  /** Single provider round-trip, normalized to neutral text + usage. */
  private async request(
    options: AIChatOptions,
    messages: AIMessage[],
    jsonMode: boolean,
  ): Promise<{ text: string; usage?: AIUsage }> {
    const completion = await this.client.chat.completions.create({
      model: options.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(options.maxOutputTokens === undefined
        ? {}
        : { max_completion_tokens: options.maxOutputTokens }),
      ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    });

    const text = completion.choices[0]?.message?.content ?? "";
    const usage: AIUsage | undefined = completion.usage
      ? {
          inputTokens: completion.usage.prompt_tokens,
          outputTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
        }
      : undefined;
    return { text, usage };
  }

  async chat(options: AIChatOptions): Promise<AIChatResult> {
    const start = Date.now();
    try {
      const { text, usage } = await this.request(options, options.messages, false);
      const logId = await logAICall({
        provider: this.name,
        model: options.model,
        operation: "chat",
        prompt: options.prompt,
        messages: options.messages,
        response: text,
        parsedOk: true,
        repairAttempted: false,
        latencyMs: Date.now() - start,
        usage,
        context: options.context,
      });
      return { text, provider: this.name, model: options.model, usage, logId };
    } catch (error) {
      const providerError = toProviderError(error);
      await logAICall({
        provider: this.name,
        model: options.model,
        operation: "chat",
        prompt: options.prompt,
        messages: options.messages,
        parsedOk: false,
        repairAttempted: false,
        latencyMs: Date.now() - start,
        context: options.context,
        error: {
          name: providerError.name,
          message: providerError.message,
          code: providerError.code,
        },
      });
      throw providerError;
    }
  }

  async chatJSON<T>(
    options: AIChatOptions,
    schema: z.ZodType<T>,
  ): Promise<AIJSONResult<T>> {
    const start = Date.now();
    const totalUsage: AIUsage = {};
    let lastText = "";
    let repairHappened = false;

    const accumulate = (usage?: AIUsage): void => {
      if (!usage) return;
      totalUsage.inputTokens = (totalUsage.inputTokens ?? 0) + (usage.inputTokens ?? 0);
      totalUsage.outputTokens = (totalUsage.outputTokens ?? 0) + (usage.outputTokens ?? 0);
      totalUsage.totalTokens = (totalUsage.totalTokens ?? 0) + (usage.totalTokens ?? 0);
    };

    try {
      const first = await this.request(options, options.messages, true);
      accumulate(first.usage);
      lastText = first.text;

      // The initial request and its single repair belong to one logical log.
      const { value, repairAttempted } = await parseStructured<T>(
        first.text,
        schema,
        async (invalid, issues) => {
          repairHappened = true;
          const repairMessages: AIMessage[] = [
            ...options.messages,
            { role: "assistant", content: invalid },
            { role: "user", content: buildRepairInstruction(issues) },
          ];
          const repaired = await this.request(options, repairMessages, true);
          accumulate(repaired.usage);
          lastText = repaired.text;
          return repaired.text;
        },
      );

      const usage = hasUsage(totalUsage) ? totalUsage : undefined;
      const logId = await logAICall({
        provider: this.name,
        model: options.model,
        operation: "chatJSON",
        prompt: options.prompt,
        messages: options.messages,
        response: lastText,
        parsedResponse: value,
        parsedOk: true,
        repairAttempted,
        latencyMs: Date.now() - start,
        usage,
        context: options.context,
      });
      return {
        data: value,
        text: lastText,
        provider: this.name,
        model: options.model,
        usage,
        logId,
        repairAttempted,
      };
    } catch (error) {
      // A parse failure keeps its typed error; anything else is a provider error.
      const finalError =
        error instanceof AIJSONParseError ? error : toProviderError(error);
      const usage = hasUsage(totalUsage) ? totalUsage : undefined;
      await logAICall({
        provider: this.name,
        model: options.model,
        operation: "chatJSON",
        prompt: options.prompt,
        messages: options.messages,
        response: lastText || undefined,
        parsedOk: false,
        repairAttempted: repairHappened,
        latencyMs: Date.now() - start,
        usage,
        context: options.context,
        error: {
          name: finalError.name,
          message: finalError.message,
          code: finalError instanceof AIProviderError ? finalError.code : undefined,
        },
      });
      throw finalError;
    }
  }
}
