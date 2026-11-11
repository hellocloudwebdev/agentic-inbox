import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createWorkersAI } from "workers-ai-provider";
import type { LanguageModel } from "ai";
import type { Env } from "../../types";
import type { LlmConfig, LlmRole } from "./types";
import { decryptApiKey } from "./encryption";

export async function resolveRole(env: Env, role: LlmRole, config?: LlmConfig): Promise<LanguageModel> {
  const resolved = config ?? await loadLlmConfig(env);
  const target = resolved.routing[role];
  if (!target || target.providerId === "workers-ai") {
    const workersAI = createWorkersAI({ binding: env.AI });
    return workersAI(target?.model || defaultWorkersModel(role)) as LanguageModel;
  }
  const provider = resolved.providers.find((item) => item.id === target.providerId);
  if (!provider) throw new Error(`No configured provider for ${role}`);
  const apiKey = await decryptApiKey(env.LLM_ENCRYPTION_KEY, provider.apiKeyEnc);
  if (provider.kind === "anthropic") {
    const anthropic = createAnthropic({ apiKey, baseURL: provider.baseUrl });
    return anthropic(target.model) as LanguageModel;
  }
  const compatible = createOpenAICompatible({
    name: provider.id,
    baseURL: provider.baseUrl,
    apiKey,
  });
  return compatible(target.model) as LanguageModel;
}
export function defaultWorkersModel(role: LlmRole): string {
  if (role === "scanner") return "@cf/meta/llama-3.1-8b-instruct-fast";
  if (role === "verifier") return "@cf/meta/llama-4-scout-17b-16e-instruct";
  return "@cf/moonshotai/kimi-k2.5";
}
export async function loadLlmConfig(env: Env): Promise<LlmConfig> {
  const { getNeonDb, ensureNeonSchema } = await import("../../db/neon-client");
  const { AppSettingsRepository } = await import("../../db/repositories/app-settings-repository");
  await ensureNeonSchema(env);
  const repo = new AppSettingsRepository(getNeonDb(env));
  const saved = await repo.getSetting<LlmConfig>("llm.config");
  const fallback = (role: LlmRole) => ({ providerId: "workers-ai", model: defaultWorkersModel(role) });
  return {
    providers: Array.isArray(saved?.providers) ? saved!.providers : [],
    routing: {
      chat: saved?.routing?.chat ?? fallback("chat"),
      draft: saved?.routing?.draft ?? fallback("draft"),
      verifier: saved?.routing?.verifier ?? fallback("verifier"),
      scanner: saved?.routing?.scanner ?? fallback("scanner"),
    },
    fallbackToWorkersAi: saved?.fallbackToWorkersAi ?? true,
  };
}
