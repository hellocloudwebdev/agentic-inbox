import { generateText } from "ai";
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
/** Resolve the first configured model whose credentials/provider can be initialized. */
export async function resolveRole(env:Env,role:LlmRole){
 const config=await getLlmConfig(env);
 const targets=configuredTargets(config,role);
 if(!targets.length) return workersAiModel(env,DEFAULTS[role]);
 let lastError:unknown;
 for(const target of targets){
  try{
   const provider=config?.providers?.find(p=>p.id===target.providerId);
   if(!provider) throw new Error(`No provider configured for ${role}: ${target.providerId}`);
   return await resolveProviderModel(env,provider,target.model);
  }catch(error){
   lastError=error;
   console.warn(`Could not initialize ${role} model ${target.providerId}/${target.model}; trying next fallback.`,error);
  }
 }
 if(config?.fallbackToWorkersAi!==false){
  console.warn(`All configured ${role} models failed to initialize; using Workers AI.`,lastError);
  return workersAiModel(env,DEFAULTS[role]);
 }
 throw lastError instanceof Error?lastError:new Error(`No usable model configured for ${role}`);
}
/** Non-streaming tasks retry the next configured model after provider request failures. */
export async function generateForRole(env:Env,role:LlmRole,options:Omit<Parameters<typeof generateText>[0],"model">){
 const config=await getLlmConfig(env);
 const targets=configuredTargets(config,role);
 let lastError:unknown;
 for(const target of targets){
  try{
   const provider=config?.providers?.find(p=>p.id===target.providerId);
   if(!provider) throw new Error(`No provider configured for ${role}: ${target.providerId}`);
   const model=await resolveProviderModel(env,provider,target.model);
   return await generateText({...options,model});
  }catch(error){
   lastError=error;
   console.warn(`LLM ${role} model ${target.providerId}/${target.model} failed; trying next fallback.`,error);
  }
 }
 if(config?.fallbackToWorkersAi!==false){
  try{return await generateText({...options,model:workersAiModel(env,DEFAULTS[role])});}
  catch(error){lastError=error;}
 }
 if(lastError instanceof Error) throw lastError;
 return generateText({...options,model:workersAiModel(env,DEFAULTS[role])});
}
