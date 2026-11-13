import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import { ensureNeonSchema, getNeonDb } from "../db/neon-client";
import { AppSettingsRepository } from "../db/repositories/app-settings-repository";
export interface AgentConversationRecord { id:string; title:string; createdAt:string; updatedAt:string }
const app = new Hono<{Bindings:Env}>();
const DEFAULT_CONVERSATION:AgentConversationRecord={id:"inbox",title:"Inbox assistant",createdAt:new Date(0).toISOString(),updatedAt:new Date(0).toISOString()};
function settingsKey(mailboxId:string){return `agent.conversations:${mailboxId.trim().toLowerCase()}`;}
function agentName(mailboxId:string,conversationId:string){return conversationId==="inbox"?mailboxId.trim().toLowerCase():`${mailboxId.trim().toLowerCase()}::${conversationId}`;}
async function repository(env:Env){await ensureNeonSchema(env);return new AppSettingsRepository(getNeonDb(env));}
async function readConversations(mailboxId:string,repo:AppSettingsRepository){
 const existing=await repo.getSetting<AgentConversationRecord[]>(settingsKey(mailboxId));
 if(existing?.length)return existing;
 await repo.setSetting(settingsKey(mailboxId),[DEFAULT_CONVERSATION]);return [DEFAULT_CONVERSATION];
}
async function clearConversation(env:Env,mailboxId:string,id:string){
 const stub=env.EMAIL_AGENT.get(env.EMAIL_AGENT.idFromName(agentName(mailboxId,id)));
 const response=await stub.fetch(new Request("https://agent/history",{method:"DELETE"}));
 if(!response.ok)throw new Error(`Could not clear chat history for conversation ${id}`);
}
app.get("/conversations",async c=>{
 const mailboxId=c.req.param("mailboxId"),repo=await repository(c.env);
 const conversations=await readConversations(mailboxId,repo);
 return c.json({conversations:conversations.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))});
});
app.post("/conversations",async c=>{
 const body=z.object({title:z.string().trim().min(1).max(80).optional()}).parse(await c.req.json().catch(()=>({})));
 const mailboxId=c.req.param("mailboxId"),repo=await repository(c.env),conversations=await readConversations(mailboxId,repo);
 const now=new Date().toISOString(),item={id:crypto.randomUUID(),title:body.title||"New chat",createdAt:now,updatedAt:now};
 await repo.setSetting(settingsKey(mailboxId),[item,...conversations]);return c.json(item,201);
});
app.put("/conversations/:conversationId",async c=>{
 const body=z.object({title:z.string().trim().min(1).max(80)}).parse(await c.req.json());
 const mailboxId=c.req.param("mailboxId"),id=c.req.param("conversationId"),repo=await repository(c.env);
 const conversations=await readConversations(mailboxId,repo);
 if(!conversations.some(item=>item.id===id))return c.json({error:"Conversation not found"},404);
 const now=new Date().toISOString(),updated=conversations.map(item=>item.id===id?{...item,title:body.title,updatedAt:now}:item);
 await repo.setSetting(settingsKey(mailboxId),updated);return c.json(updated.find(item=>item.id===id));
});
app.post("/conversations/:conversationId/touch",async c=>{
 const mailboxId=c.req.param("mailboxId"),id=c.req.param("conversationId"),repo=await repository(c.env);
 const conversations=await readConversations(mailboxId,repo);
 if(!conversations.some(item=>item.id===id))return c.json({error:"Conversation not found"},404);
 const now=new Date().toISOString();await repo.setSetting(settingsKey(mailboxId),conversations.map(item=>item.id===id?{...item,updatedAt:now}:item));
 return c.json({ok:true});
});
app.post("/conversations/:conversationId/clear",async c=>{
 const mailboxId=c.req.param("mailboxId"),id=c.req.param("conversationId"),repo=await repository(c.env);
 const conversations=await readConversations(mailboxId,repo);
 if(!conversations.some(item=>item.id===id))return c.json({error:"Conversation not found"},404);
 await clearConversation(c.env,mailboxId,id);return c.json({ok:true});
});
app.delete("/conversations/:conversationId",async c=>{
 const mailboxId=c.req.param("mailboxId"),id=c.req.param("conversationId"),repo=await repository(c.env);
 const conversations=await readConversations(mailboxId,repo);
 if(!conversations.some(item=>item.id===id))return c.json({error:"Conversation not found"},404);
 await clearConversation(c.env,mailboxId,id);
 if(id!=="inbox")await repo.setSetting(settingsKey(mailboxId),conversations.filter(item=>item.id!==id));
 return c.json({ok:true,retained:id==="inbox"});
});
app.delete("/conversations",async c=>{
 const mailboxId=c.req.param("mailboxId"),repo=await repository(c.env),conversations=await readConversations(mailboxId,repo);
 for(const item of conversations)await clearConversation(c.env,mailboxId,item.id);
 await repo.setSetting(settingsKey(mailboxId),[DEFAULT_CONVERSATION]);
 return c.json({ok:true,deleted:conversations.length});
});
export {app as agentConversationRoutes};
