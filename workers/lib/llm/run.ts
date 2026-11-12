import { generateText } from "ai";
import { createFallback } from "ai-fallback";
import type { Env } from "../../types";
import type { LlmRole, LlmConfig, RoleTarget } from "./types";
import { AppSettingsRepository } from "../../db/repositories/app-settings-repository";
import { getNeonDb } from "../../db/neon-client";
import { resolveProviderModel, workersAiModel } from "./registry";
const DEFAULTS:Record<LlmRole,string>={chat:"@cf/moonshotai/kimi-k2.5",draft:"@cf/moonshotai/kimi-k2.5",verifier:"@cf/meta/llama-4-scout-17b-16e-instruct",scanner:"@cf/meta/llama-3.1-8b-instruct-fast"};
export async function getLlmConfig(env:Env):Promise<LlmConfig|null>{
 const repo=new AppSettingsRepository(getNeonDb(env)); return repo.getSetting<LlmConfig>("llm.config");
}
function configuredTargets(config:LlmConfig|null,role:LlmRole):RoleTarget[]{
 const primary=config?.routing?.[role];
 return [primary,...(config?.fallbacks?.[role]??[])].filter((target):target is RoleTarget=>!!target?.providerId&&!!target.model);
}
/**
 * Build a request-level fallback model. AI SDK retries the next model when a
 * provider fails before producing output, including streaming chat requests.
 */
export async function resolveRole(env:Env,role:LlmRole){
 const config=await getLlmConfig(env);
 const targets=configuredTargets(config,role);
 const models=[];
 let lastError:unknown;
 for(const target of targets){
  try{
   const provider=config?.providers?.find(p=>p.id===target.providerId);
   if(!provider) throw new Error(`No provider configured for ${role}: ${target.providerId}`);
   models.push(await resolveProviderModel(env,provider,target.model));
  }catch(error){
   lastError=error;
   console.warn(`Could not initialize ${role} model ${target.providerId}/${target.model}; skipping it.`,error);
  }
 }
 if(config?.fallbackToWorkersAi!==false) models.push(workersAiModel(env,DEFAULTS[role]));
 if(!models.length){
  if(lastError instanceof Error) throw lastError;
  return workersAiModel(env,DEFAULTS[role]);
 }
 return models.length===1?models[0]:createFallback({models});
}
export async function generateForRole(env:Env,role:LlmRole,options:Omit<Parameters<typeof generateText>[0],"model">){
 return generateText({...options,model:await resolveRole(env,role)});
}
