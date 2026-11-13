import type { Env } from "../types";
import { ensureNeonSchema, getNeonDb } from "../db/neon-client";
import { AppSettingsRepository } from "../db/repositories/app-settings-repository";
export const MCP_API_KEYS_SETTING = "mcp.apiKeys";
export interface McpApiKeyRecord {
  id: string; label: string; tokenHash: string; createdAt: string;
  lastUsedAt: string | null; revokedAt: string | null;
}
export async function hashMcpApiKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
export async function authenticateMcpApiKey(request: Request, env: Env): Promise<boolean> {
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(aib_live_[A-Za-z0-9_-]+)$/i)?.[1];
  if (!token) return false;
  try {
    await ensureNeonSchema(env);
    const repository = new AppSettingsRepository(getNeonDb(env));
    const records = await repository.getSetting<McpApiKeyRecord[]>(MCP_API_KEYS_SETTING) ?? [];
    const tokenHash = await hashMcpApiKey(token);
    const matching = records.find((record) => !record.revokedAt && constantTimeEqual(record.tokenHash, tokenHash));
    if (!matching) return false;
    const now = new Date().toISOString();
    // Keep activity in a separate setting so a concurrent last-used update
    // cannot overwrite a simultaneous key revocation in the key-history record.
    await repository.setSetting(`${MCP_API_KEYS_SETTING}.lastUsed:${matching.id}`, now);
    return true;
  } catch (error) {
    console.error("MCP API-key authentication failed closed:", error instanceof Error ? error.message : String(error));
    return false;
  }
}
