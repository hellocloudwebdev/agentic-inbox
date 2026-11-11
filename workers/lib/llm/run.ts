import { generateText } from "ai";
import type { Env } from "../../types";
import type { LlmRole, LlmConfig } from "./types";
import { AppSettingsRepository } from "../../db/repositories/app-settings-repository";
import { getNeonDb } from "../../db/neon-client";
import { resolveProviderModel, workersAiModel } from "./registry";
const DEFAULTS:Record<LlmRole,string>={chat:"@cf/moonshotai/kimi-k2.5",draft:"@cf/moonshotai/kimi-k2.5",verifier:"@cf/meta/llama-4-scout-17b-16e-instruct",scanner:"@cf/meta/llama-3.1-8b-instruct-fast"};
export async function getLlmConfig(env:Env):Promise<LlmConfig|null>{
 const repo=new AppSettingsRepository(getNeonDb(env)); return repo.getSetting<LlmConfig>("llm.config");
}
export async function resolveRole(env:Env,role:LlmRole){
 const config=await getLlmConfig(env); const target=config?.routing?.[role];
 if(!target?.providerId) return workersAiModel(env,DEFAULTS[role]);
 const provider=config?.providers?.find(p=>p.id===target.providerId);
 if(!provider) throw new Error(`No provider configured for ${role}`);
 return resolveProviderModel(env,provider,target.model);
}
export async function generateForRole(env:Env,role:LlmRole,options:Omit<Parameters<typeof generateText>[0],"model">){
 const config=await getLlmConfig(env);
 const target=config?.routing?.[role];
 try {
  const model=target?.providerId
   ? await resolveRole(env,role)
   : workersAiModel(env,DEFAULTS[role]);
  return await generateText({...options,model});
 } catch(error) {
  if(config?.fallbackToWorkersAi===false) throw error;
  console.warn(`LLM role ${role} failed; falling back to Workers AI`,error);
  return generateText({...options,model:workersAiModel(env,DEFAULTS[role])});
 }
}
