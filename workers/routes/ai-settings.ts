import { Hono } from "hono";
import { z } from "zod";
import { generateText } from "ai";
import type { Env } from "../types";
import { AppSettingsRepository } from "../db/repositories/app-settings-repository";
import { getNeonDb, ensureNeonSchema } from "../db/neon-client";
import { encryptApiKey, decryptApiKey } from "../lib/llm/crypto";
import { fetchProviderModels } from "../lib/llm/models";
import { resolveProviderModel } from "../lib/llm/registry";
import type { AgentSkill, LlmConfig, LlmProvider, ProviderKind } from "../lib/llm/types";

const app = new Hono<{ Bindings: Env }>();
const providerSchema = z.object({
 id:z.string().min(1).max(80), name:z.string().min(1).max(120),
 kind:z.enum(["openai-compatible","openai-responses","openai-chat-completions","anthropic"]), baseUrl:z.string().url(),
 apiKey:z.string().optional(), models:z.array(z.string().min(1)).max(500).default([]),
});
const roleSchema=z.object({providerId:z.string(),model:z.string()});
const configSchema=z.object({
 providers:z.array(providerSchema).max(30),
 routing:z.object({chat:roleSchema,draft:roleSchema,verifier:roleSchema,scanner:roleSchema}),
 fallbacks:z.object({
  chat:z.array(roleSchema).max(2).default([]),
  draft:z.array(roleSchema).max(2).default([]),
  verifier:z.array(roleSchema).max(2).default([]),
  scanner:z.array(roleSchema).max(2).default([]),
 }).optional(),
 fallbackToWorkersAi:z.boolean().default(true),
});
const skillSchema=z.object({
 id:z.string().min(1),name:z.string().min(1).max(100),description:z.string().min(1).max(500),
 instructions:z.string().min(1).max(12000),enabled:z.boolean(),mode:z.enum(["always","on-demand"]),
});
async function repository(env:Env) {
 await ensureNeonSchema(env);
 return new AppSettingsRepository(getNeonDb(env));
}
function publicConfig(config:LlmConfig|null) {
 if(!config) return {providers:[],routing:{chat:{providerId:"",model:""},draft:{providerId:"",model:""},verifier:{providerId:"",model:""},scanner:{providerId:"",model:""}},fallbacks:{chat:[],draft:[],verifier:[],scanner:[]},fallbackToWorkersAi:true};
 return {...config,providers:config.providers.map(({apiKeyEnc,...provider})=>({...provider,hasKey:!!apiKeyEnc}))};
}
app.get("/config",async c=>{
 const repo=await repository(c.env);
 const config=await repo.getSetting<LlmConfig>("llm.config");
 const skills=await repo.getSetting<AgentSkill[]>("agent.skills")??[];
 return c.json({config:publicConfig(config),skills});
});
app.put("/config",async c=>{
 const body=await c.req.json();
 const parsed=configSchema.parse(body);
 const repo=await repository(c.env);
 const existing=await repo.getSetting<LlmConfig>("llm.config");
 const providers:LlmProvider[]=[];
 for(const item of parsed.providers){
  const previous=existing?.providers.find(p=>p.id===item.id);
  const apiKeyEnc=item.apiKey?.trim()
   ? await encryptApiKey(item.apiKey,c.env.LLM_ENCRYPTION_KEY)
   : previous?.apiKeyEnc;
  if(!apiKeyEnc) throw new Error(`API key required for provider ${item.name}`);
  providers.push({id:item.id,name:item.name,kind:item.kind,baseUrl:item.baseUrl,apiKeyEnc,models:item.models});
 }
 const config:LlmConfig={providers,routing:parsed.routing,fallbacks:parsed.fallbacks,fallbackToWorkersAi:parsed.fallbackToWorkersAi};
 for(const role of ["chat","draft","verifier","scanner"] as const){
  const target=config.routing[role];
  const targets=[target,...(parsed.fallbacks?.[role]??[])].filter(item=>item.providerId);
  for(const candidate of targets){
   if(!providers.some(p=>p.id===candidate.providerId&&p.models.includes(candidate.model)))
    return c.json({error:`Invalid ${role} fallback model routing`},400);
  }
 }
 await repo.setSetting("llm.config",config);
 return c.json(publicConfig(config));
});
app.post("/models/fetch",async c=>{
 const body=z.object({kind:z.enum(["openai-compatible","anthropic"]),baseUrl:z.string().url(),apiKey:z.string().min(1)}).parse(await c.req.json());
 try {
  const models=await fetchProviderModels(body);
  return c.json({models});
 } catch(error) {
  // Provider/network failures must be actionable client errors, not opaque Worker 500s.
  const message=error instanceof Error ? error.message : "Unknown provider discovery error";
  console.error("AI provider model discovery failed:", message);
  return c.json({error:message},502);
 }
});
app.post("/test",async c=>{
 const body=z.object({providerId:z.string(),model:z.string()}).parse(await c.req.json());
 const repo=await repository(c.env);
 const config=await repo.getSetting<LlmConfig>("llm.config");
 const provider=config?.providers.find(p=>p.id===body.providerId);
 if(!provider) return c.json({error:"Provider not found"},404);
 try{
  const model=await resolveProviderModel(c.env,provider,body.model);
  const result=await generateText({model,prompt:"Reply with exactly: Connection successful.",maxOutputTokens:24});
  return c.json({ok:true,response:result.text});
 }catch(error){return c.json({ok:false,error:(error as Error).message},502);}
});
app.put("/skills",async c=>{
 const skills=z.array(skillSchema).max(100).parse(await c.req.json());
 const repo=await repository(c.env);
 await repo.setSetting("agent.skills",skills);
 return c.json({skills});
});
export { app as aiSettingsRoutes };
