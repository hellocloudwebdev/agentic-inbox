import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createWorkersAI } from "workers-ai-provider";
import type { Env } from "../../types";
import type { LlmProvider } from "./types";
import { decryptApiKey } from "./crypto";
import { assertSafeProviderUrl } from "./safe-url";
export async function resolveProviderModel(env: Env, provider: LlmProvider, modelId: string) {
 if(!provider.models.includes(modelId)) throw new Error("Selected model is not in the provider's configured model list");
 if(!provider.apiKeyEnc) throw new Error("Provider API key is not configured");
 const apiKey=await decryptApiKey(provider.apiKeyEnc,env.LLM_ENCRYPTION_KEY);
 const baseURL=assertSafeProviderUrl(provider.baseUrl).toString().replace(/\/$/,"");
 if(provider.kind==="anthropic") return createAnthropic({apiKey,baseURL})(modelId);
 if(provider.kind==="openai-responses") return createOpenAI({apiKey,baseURL})(modelId);
 if(provider.kind==="openai-chat-completions") return createOpenAI({apiKey,baseURL}).chat(modelId);
 return createOpenAICompatible({name:provider.id,apiKey,baseURL})(modelId);
}
export function workersAiModel(env: Env, modelId: string) {
 return createWorkersAI({binding:env.AI})(modelId as any);
}
