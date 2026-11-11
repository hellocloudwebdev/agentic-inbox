import { describe, expect, it } from "vitest";
import { decryptApiKey, encryptApiKey } from "../workers/lib/llm/encryption";
import { assertSafeProviderUrl } from "../workers/lib/llm/safe-url";
import { parseModels } from "../workers/lib/llm/models";

const secret = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

describe("LLM credential encryption", () => {
  it("round-trips an API key with authenticated encryption", async () => {
    const encrypted = await encryptApiKey(secret, "sk-test-sensitive");
    expect(encrypted).not.toContain("sk-test-sensitive");
    expect(await decryptApiKey(secret, encrypted)).toBe("sk-test-sensitive");
  });
  it("rejects a modified ciphertext", async () => {
    const encrypted = await encryptApiKey(secret, "sk-test-sensitive");
    const bytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
    bytes[bytes.length - 1] ^= 1;
    const tampered = btoa(String.fromCharCode(...bytes));
    await expect(decryptApiKey(secret, tampered)).rejects.toThrow();
  });
  it("rejects malformed encryption secrets", async () => {
    await expect(encryptApiKey("bad", "secret")).rejects.toThrow(/32-byte/);
  });
});

describe("provider URL validation", () => {
  it("accepts public HTTPS provider URLs", () => {
    expect(assertSafeProviderUrl("https://api.openai.com/v1").hostname).toBe("api.openai.com");
  });
  it.each([
    "http://api.example.com",
    "https://localhost",
    "https://127.0.0.1",
    "https://10.0.0.5",
    "https://192.168.1.10",
    "https://metadata.google.internal",
    "https://user:pass@example.com",
  ])("rejects unsafe URL %s", (url) => {
    expect(() => assertSafeProviderUrl(url)).toThrow();
  });
});

describe("provider model-list parsing", () => {
  it("parses OpenAI-compatible model data", () => {
    expect(parseModels({ data: [{ id: "gpt-x" }, { id: "model-y", name: "Model Y" }] }))
      .toEqual([{ id: "gpt-x" }, { id: "model-y", name: "Model Y" }]);
  });
  it("parses alternate models arrays and drops invalid entries", () => {
    expect(parseModels({ models: [{ name: "claude-x" }, null, "custom-model"] }))
      .toEqual([{ id: "claude-x" }, { id: "custom-model" }]);
  });
  it("rejects malformed provider payloads", () => {
    expect(() => parseModels({ data: "not-an-array" })).toThrow(/models array/);
  });
});
