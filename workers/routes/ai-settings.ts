import { Hono } from "hono";
import { z } from "zod";
import { generateText } from "ai";
import type { Env } from "../types";
import { getNeonDb, ensureNeonSchema } from "../db/neon-client";
import { AppSettingsRepository } from "../db/repositories/app-settings-repository";
import { encryptApiKey, decryptApiKey } from "../lib/llm/encryption";
import { fetchProviderModels } from "../lib/llm/models";
import { assertSafeProviderUrl } from "../lib/llm/safe-url";
import { loadLlmConfig, resolveRole } from "../lib/llm/registry";
import type { AgentSkill, LlmConfig, LlmRole } from "../lib/llm/types";

const router = new Hono<{ Bindings: Env }>();
const roleSchema = z.object({ providerId: z.string().min(1), model: z.string().min(1) });
const providerSchema = z.object({
  id: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().min(1).max(120),
  kind: z.enum(["openai-compatible", "anthropic"]),
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  models: z.array(z.object({ id: z.string(), name: z.string().optional() })).default([]),
  removeKey: z.boolean().optional(),
});
const configSchema = z.object({
  providers: z.array(providerSchema),
  routing: z.object({ chat: roleSchema, draft: roleSchema, verifier: roleSchema, scanner: roleSchema }),
  fallbackToWorkersAi: z.boolean().default(true),
});
const skillsSchema = z.array(z.object({
  id: z.string().min(1), name: z.string().min(1).max(100),
  description: z.string().min(1).max(500), instructions: z.string().min(1).max(12000),
  enabled: z.boolean(), mode: z.enum(["always", "on-demand"]),
}));

async function settingsRepo(env: Env) {
  await ensureNeonSchema(env);
  return new AppSettingsRepository(getNeonDb(env));
}
function publicConfig(config: LlmConfig) {
  return {
    providers: config.providers.map(({ apiKeyEnc, ...provider }) => ({ ...provider, hasKey: !!apiKeyEnc })),
    routing: config.routing,
    fallbackToWorkersAi: config.fallbackToWorkersAi,
  };
}
router.get("/config", async (c) => {
  const config = await loadLlmConfig(c.env);
  return c.json(publicConfig(config));
});
router.put("/config", async (c) => {
  const parsed = configSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid LLM configuration", details: parsed.error.flatten() }, 400);
  const existing = await loadLlmConfig(c.env);
  const providers = [];
  for (const input of parsed.data.providers) {
    try { assertSafeProviderUrl(input.baseUrl); } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Unsafe provider URL" }, 400);
    }
    const old = existing.providers.find((provider) => provider.id === input.id);
    let apiKeyEnc = old?.apiKeyEnc ?? "";
    if (input.apiKey?.trim()) apiKeyEnc = await encryptApiKey(c.env.LLM_ENCRYPTION_KEY, input.apiKey.trim());
    if (input.removeKey) apiKeyEnc = "";
    if (!apiKeyEnc) return c.json({ error: `API key required for provider ${input.name}` }, 400);
    providers.push({
      id: input.id, name: input.name, kind: input.kind, baseUrl: input.baseUrl.replace(/\/$/, ""),
      apiKeyEnc, models: input.models,
    });
  }
  const providerIds = new Set(providers.map((provider) => provider.id));
  for (const role of ["chat", "draft", "verifier", "scanner"] as LlmRole[]) {
    const target = parsed.data.routing[role];
    if (target.providerId !== "workers-ai" && !providerIds.has(target.providerId)) {
      return c.json({ error: `Unknown provider selected for ${role}` }, 400);
    }
  }
  const next: LlmConfig = { ...parsed.data, providers };
  const repo = await settingsRepo(c.env);
  await repo.setSetting("llm.config", next);
  return c.json(publicConfig(next));
});
router.post("/models/fetch", async (c) => {
  const body = z.object({
    kind: z.enum(["openai-compatible", "anthropic"]),
    baseUrl: z.string().url(), apiKey: z.string().min(1),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid provider model request" }, 400);
  try {
    const models = await fetchProviderModels(body.data);
    return c.json({ models });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Could not fetch models" }, 400);
  }
});
router.post("/test", async (c) => {
  const body = z.object({
    providerId: z.string().min(1), model: z.string().min(1),
    role: z.enum(["chat", "draft", "verifier", "scanner"]).default("chat"),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid model test request" }, 400);
  try {
    const config = await loadLlmConfig(c.env);
    if (!config.providers.some((provider) => provider.id === body.data.providerId)) {
      return c.json({ error: "Provider not found" }, 404);
    }
    const model = await resolveRole(c.env, body.data.role, {
      ...config, routing: { ...config.routing, [body.data.role]: { providerId: body.data.providerId, model: body.data.model } },
    });
    const result = await generateText({
      model, prompt: "Reply with exactly: Agentic Inbox connection successful.",
      maxOutputTokens: 32, abortSignal: AbortSignal.timeout(15000),
    });
    return c.json({ ok: true, text: result.text.slice(0, 200) });
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : "Model test failed" }, 400);
  }
});
router.get("/skills", async (c) => {
  const repo = await settingsRepo(c.env);
  const skills = await repo.getSetting<AgentSkill[]>("agent.skills");
  return c.json({ skills: Array.isArray(skills) ? skills : [] });
});
router.put("/skills", async (c) => {
  const parsed = skillsSchema.safeParse((await c.req.json()).skills);
  if (!parsed.success) return c.json({ error: "Invalid skills", details: parsed.error.flatten() }, 400);
  const ids = parsed.data.map((skill) => skill.id);
  if (new Set(ids).size !== ids.length) return c.json({ error: "Skill IDs must be unique" }, 400);
  const repo = await settingsRepo(c.env);
  await repo.setSetting("agent.skills", parsed.data);
  return c.json({ skills: parsed.data });
});
export default router;
