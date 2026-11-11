import { describe,it,expect,vi,afterEach } from "vitest";
import { encryptApiKey,decryptApiKey } from "../workers/lib/llm/crypto";
import { assertSafeProviderUrl } from "../workers/lib/llm/safe-url";
import { fetchProviderModels } from "../workers/lib/llm/models";
const secret=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
describe("LLM encryption",()=>{
 it("encrypts and decrypts API keys without storing plaintext",async()=>{
  const encrypted=await encryptApiKey("sk-test-secret",secret);
  expect(encrypted).not.toContain("sk-test-secret");
  expect(await decryptApiKey(encrypted,secret)).toBe("sk-test-secret");
 });
 it("rejects tampered ciphertext",async()=>{
  const encrypted=await encryptApiKey("secret",secret);
  const bytes=Uint8Array.from(atob(encrypted),c=>c.charCodeAt(0));bytes[bytes.length-1]^=1;
  await expect(decryptApiKey(btoa(String.fromCharCode(...bytes)),secret)).rejects.toThrow();
 });
});
describe("provider URL validation",()=>{
 it("allows public HTTPS provider URLs",()=>expect(assertSafeProviderUrl("https://api.example.com/v1").hostname).toBe("api.example.com"));
 it.each(["http://api.example.com","https://localhost","https://127.0.0.1","https://192.168.1.5","https://user:pass@example.com"])("rejects unsafe URL %s",url=>expect(()=>assertSafeProviderUrl(url)).toThrow());
});
describe("model discovery",()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it("parses OpenAI-compatible model ids and preserves /v1 path",async()=>{
  const fetch=vi.fn(async (url:URL)=>{expect(url.pathname).toBe("/v1/models");return new Response(JSON.stringify({data:[{id:"model-a"},{id:"model-b"},{id:"model-a"}]}),{status:200})});
  vi.stubGlobal("fetch",fetch);
  await expect(fetchProviderModels({baseUrl:"https://api.example.com/v1",kind:"openai-compatible",apiKey:"token"})).resolves.toEqual(["model-a","model-b"]);
  expect(fetch).toHaveBeenCalledWith(expect.any(URL),expect.objectContaining({redirect:"error",headers:{Authorization:"Bearer token"}}));
 });
 it("uses Anthropic authentication header",async()=>{
  const fetch=vi.fn(async()=>new Response(JSON.stringify({data:[{id:"claude-test"}]}),{status:200}));
  vi.stubGlobal("fetch",fetch);
  await expect(fetchProviderModels({baseUrl:"https://api.anthropic.com/v1",kind:"anthropic",apiKey:"secret"})).resolves.toEqual(["claude-test"]);
  expect(fetch.mock.calls[0][1]?.headers).toEqual({"x-api-key":"secret","anthropic-version":"2023-06-01"});
 });
});
