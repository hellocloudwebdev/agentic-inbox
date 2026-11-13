import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import { ensureNeonSchema, getNeonDb } from "../db/neon-client";
import { AppSettingsRepository } from "../db/repositories/app-settings-repository";
import { hashMcpApiKey, MCP_API_KEYS_SETTING, type McpApiKeyRecord } from "../lib/mcp-auth";
const app = new Hono<{ Bindings: Env }>();
async function getRepository(env: Env) {
  await ensureNeonSchema(env);
  return new AppSettingsRepository(getNeonDb(env));
}
async function readKeys(repository: AppSettingsRepository) {
  return await repository.getSetting<McpApiKeyRecord[]>(MCP_API_KEYS_SETTING) ?? [];
}
function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function createKey(label: string): Promise<{ token: string; record: McpApiKeyRecord }> {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const token = \`aib_live_\${encodeBase64Url(random)}\`;
  return { token, record: {
    id: crypto.randomUUID(), label, tokenHash: await hashMcpApiKey(token),
    createdAt: new Date().toISOString(), lastUsedAt: null, revokedAt: null,
  }};
}
function publicKey(record: McpApiKeyRecord, lastUsedAt: string | null = record.lastUsedAt) {
  return { id: record.id, label: record.label, createdAt: record.createdAt,
    lastUsedAt, revokedAt: record.revokedAt,
    status: record.revokedAt ? "revoked" : "active" };
}
app.get("/keys", async (c) => {
  const repository = await getRepository(c.env);
  const records = await readKeys(repository);
  const keys = await Promise.all(records.map(async (record) => {
    const lastUsedAt = await repository.getSetting<string>(`${MCP_API_KEYS_SETTING}.lastUsed:${record.id}`) ?? record.lastUsedAt;
    return publicKey(record, lastUsedAt);
  }));
  return c.json({ keys: keys.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)) });
});
app.post("/keys", async (c) => {
  const body = z.object({ label: z.string().trim().min(1).max(80).default("MCP client") }).parse(await c.req.json().catch(()=>({})));
  const repository = await getRepository(c.env), records = await readKeys(repository);
  const generated = await createKey(body.label);
  await repository.setSetting(MCP_API_KEYS_SETTING, [...records, generated.record]);
  return c.json({ key: generated.token, keyInfo: publicKey(generated.record) }, 201);
});
app.post("/keys/:id/regenerate", async (c) => {
  const repository = await getRepository(c.env), records = await readKeys(repository);
  const existing = records.find((record)=>record.id===c.req.param("id")&&!record.revokedAt);
  if (!existing) return c.json({error:"Active API key not found"},404);
  const generated = await createKey(existing.label), now = new Date().toISOString();
  const next = records.map((record)=>record.id===existing.id?{...record,revokedAt:now}:record);
  next.push(generated.record);
  await repository.setSetting(MCP_API_KEYS_SETTING,next);
  return c.json({key:generated.token,keyInfo:publicKey(generated.record),revokedKeyId:existing.id},201);
});
app.delete("/keys/:id", async (c) => {
  const repository = await getRepository(c.env), records = await readKeys(repository), id = c.req.param("id");
  const existing = records.find((record)=>record.id===id);
  if (!existing) return c.json({error:"API key not found"},404);
  if (!existing.revokedAt) await repository.setSetting(MCP_API_KEYS_SETTING,records.map((record)=>
    record.id===id?{...record,revokedAt:new Date().toISOString()}:record));
  return c.json({ok:true});
});
export { app as mcpKeyRoutes };
