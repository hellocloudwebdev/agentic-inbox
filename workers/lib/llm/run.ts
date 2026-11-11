import { generateText, type GenerateTextOptions } from "ai";
import type { Env } from "../../types";
import type { LlmRole } from "./types";
import { defaultWorkersModel, loadLlmConfig, resolveRole } from "./registry";
import { createWorkersAI } from "workers-ai-provider";

export async function generateForRole(
  env: Env,
  role: LlmRole,
  options: Omit<GenerateTextOptions, "model">,
) {
  const config = await loadLlmConfig(env);
  try {
    const model = await resolveRole(env, role, config);
    return await generateText({ ...options, model });
  } catch (primaryError) {
    if (!config.fallbackToWorkersAi || config.routing[role].providerId === "workers-ai") throw primaryError;
    console.warn(`LLM role ${role} failed; retrying with Workers AI`, primaryError);
    const workersAI = createWorkersAI({ binding: env.AI });
    return generateText({ ...options, model: workersAI(defaultWorkersModel(role)) });
  }
}
