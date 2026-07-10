import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * CLI smoke check for the M1 AI layer. Runs `chat()` and `chatJSON()` against
 * the configured provider and confirms both calls were logged to MongoDB.
 *
 * The app modules it uses are `server-only`, which throws under a plain Node
 * resolver, and tsx does not auto-load `.env`. Rather than require callers to
 * pass flags, we re-exec once with the `react-server` export condition and
 * `--env-file=.env`, then continue in the child.
 */
function ensureRuntime(): void {
  if (process.env.__AI_SMOKE_CHILD === "1") return;
  const flags = ["--conditions=react-server"];
  if (existsSync(".env")) flags.push("--env-file=.env");
  const result = spawnSync(
    process.execPath,
    [...flags, ...process.execArgv, ...process.argv.slice(1)],
    { stdio: "inherit", env: { ...process.env, __AI_SMOKE_CHILD: "1" } },
  );
  process.exit(result.status ?? 1);
}

ensureRuntime();

async function main(): Promise<void> {
  const { env } = await import("@/lib/env");
  const { connectToDatabase } = await import("@/lib/db/mongoose");
  const { getAIProvider } = await import("@/lib/ai/client");
  const { smokeResultSchema } = await import("@/lib/schemas/ai");
  const { AICallLog } = await import("@/lib/models/ai-call-log");
  const mongoose = (await import("mongoose")).default;

  await connectToDatabase();
  const provider = getAIProvider();
  const model = env.aiGenerationModel;

  const chatResult = await provider.chat({
    model,
    messages: [
      { role: "system", content: "Reply with exactly the text M1_OK and nothing else." },
      { role: "user", content: "Respond now." },
    ],
    prompt: { id: "smoke-chat", version: "v1" },
  });

  const jsonResult = await provider.chatJSON(
    {
      model,
      messages: [
        {
          role: "system",
          content: 'Return only JSON of the form {"ok": true, "message": "M1_JSON_OK"}.',
        },
        { role: "user", content: "Respond now with that JSON object." },
      ],
      prompt: { id: "smoke-json", version: "v1" },
    },
    smokeResultSchema,
  );

  const logIds = [chatResult.logId, jsonResult.logId].filter(
    (id): id is string => typeof id === "string",
  );
  if (logIds.length !== 2) {
    throw new Error("Expected both AI calls to return a log ID");
  }

  const found = await AICallLog.countDocuments({ _id: { $in: logIds } });
  if (found !== 2) {
    throw new Error(`Expected 2 persisted logs, found ${found}`);
  }

  console.log("AI smoke check passed");
  console.log(`  provider:   ${chatResult.provider}`);
  console.log(`  model:      ${model}`);
  console.log(`  chat text:  ${chatResult.text.trim()}`);
  console.log(`  structured: ${JSON.stringify(jsonResult.data)}`);
  console.log(`  log ids:    ${logIds.join(", ")}`);

  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`AI smoke check failed: ${message}`);
  process.exit(1);
});
