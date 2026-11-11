import { assertSafeProviderUrl } from "./safe-url";

export type ProviderKind = "openai-compatible" | "anthropic";
export interface ProviderModel { id: string; name?: string; }
export interface ProviderConfig {
  id: string; name: string; kind: ProviderKind; baseUrl: string;
  apiKeyEnc: string; models: ProviderModel[];
}
function parseModels(payload: unknown): ProviderModel[] {
  if (!payload || typeof payload !== "object") throw new Error("Provider returned an invalid model list");
  const data = (payload as { data?: unknown; models?: unknown }).data ??
    (payload as { models?: unknown }).models;
  if (!Array.isArray(data)) throw new Error("Provider response did not contain a models array");
  return data.map((item) => {
    if (typeof item === "string") return { id: item };
    if (!item || typeof item !== "object") return null;
    const row = item as { id?: unknown; name?: unknown };
    const id = typeof row.id === "string" ? row.id : typeof row.name === "string" ? row.name : "";
    return id ? { id, ...(typeof row.name === "string" ? { name: row.name } : {}) } : null;
  }).filter((item): item is ProviderModel => !!item);
}
export async function fetchProviderModels(input: {
  kind: ProviderKind; baseUrl: string; apiKey: string;
}): Promise<ProviderModel[]> {
  const base = assertSafeProviderUrl(input.baseUrl);
  const suffix = input.kind === "anthropic" ? "/v1/models" : "/models";
  const url = new URL(base.toString().replace(/\/+$/, "") + suffix);
  const headers: Record<string, string> = input.kind === "anthropic"
    ? { "x-api-key": input.apiKey, "anthropic-version": "2023-06-01" }
    : { Authorization: `Bearer ${input.apiKey}` };
  const response = await fetch(url, { method: "GET", headers, redirect: "error" });
  if (!response.ok) throw new Error(`Provider model discovery failed (${response.status})`);
  return parseModels(await response.json());
}
export { parseModels };
