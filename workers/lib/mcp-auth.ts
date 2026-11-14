import type { Env } from "../types";
import { ensureNeonSchema, getNeonDb } from "../db/neon-client";
import { AppSettingsRepository } from "../db/repositories/app-settings-repository";

export const MCP_API_KEYS_SETTING = "mcp.apiKeys";
export const MCP_SESSION_KEY_ID_HEADER = "x-agentic-inbox-mcp-key-id";

export interface McpApiKeyRecord {
  id: string;
  label: string;
  tokenHash: string;
  mailboxIds?: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface McpApiPrincipal {
  keyId: string;
  mailboxIds: string[];
}

function normalizeMailboxIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

export function isMailboxAuthorized(principal: McpApiPrincipal, mailboxId: string): boolean {
  return principal.mailboxIds.includes(mailboxId.trim().toLowerCase());
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

async function readKeyRecords(env: Env): Promise<McpApiKeyRecord[]> {
  await ensureNeonSchema(env);
  const repository = new AppSettingsRepository(getNeonDb(env));
  return await repository.getSetting<McpApiKeyRecord[]>(MCP_API_KEYS_SETTING) ?? [];
}

/** Resolve the current, non-revoked principal on every tool call so revocations take effect for open sessions. */
export async function getMcpApiPrincipal(env: Env, keyId: string | undefined): Promise<McpApiPrincipal | null> {
  if (!keyId) return null;
  try {
    const records = await readKeyRecords(env);
    const matching = records.find((record) => record.id === keyId && !record.revokedAt);
    if (!matching) return null;
    const mailboxIds = normalizeMailboxIds(matching.mailboxIds);
    if (mailboxIds.length === 0) return null;
    return { keyId: matching.id, mailboxIds };
  } catch (error) {
    console.error("MCP API-key principal lookup failed closed:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

/** Authenticate the bearer key at the Worker boundary and return only its non-secret principal. */
export async function authenticateMcpApiKey(request: Request, env: Env): Promise<McpApiPrincipal | null> {
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(aib_live_[A-Za-z0-9_-]+)$/i)?.[1];
  if (!token) return null;
  try {
    const records = await readKeyRecords(env);
    const tokenHash = await hashMcpApiKey(token);
    const matching = records.find((record) => !record.revokedAt && constantTimeEqual(record.tokenHash, tokenHash));
    if (!matching) return null;
    const mailboxIds = normalizeMailboxIds(matching.mailboxIds);
    if (mailboxIds.length === 0) return null;
    const repository = new AppSettingsRepository(getNeonDb(env));
    await repository.setSetting(`${MCP_API_KEYS_SETTING}.lastUsed:${matching.id}`, new Date().toISOString());
    return { keyId: matching.id, mailboxIds };
  } catch (error) {
    console.error("MCP API-key authentication failed closed:", error instanceof Error ? error.message : String(error));
    return null;
  }
}
