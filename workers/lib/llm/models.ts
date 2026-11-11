import { assertSafeProviderUrl } from "./safe-url";
import type { ProviderKind } from "./types";
export async function fetchProviderModels(input: { baseUrl: string; kind: ProviderKind; apiKey: string }): Promise<string[]> {
 const base=assertSafeProviderUrl(input.baseUrl);
 const endpoint=new URL("models",base.toString().replace(/\\/?$/,"/"));
 const headers:Record<string,string> = input.kind==="anthropic"
  ? {"x-api-key":input.apiKey,"anthropic-version":"2023-06-01"}
  : {Authorization:`Bearer ${input.apiKey}`};
 const response=await fetch(endpoint,{headers,redirect:"error"});
 if(!response.ok) throw new Error(`Provider model discovery failed (${response.status})`);
 const body=await response.json() as {data?:Array<{id?:unknown}>;models?:Array<{name?:unknown;id?:unknown}>};
 const ids=(body.data??body.models??[]).map(x=>typeof x.id==="string"?x.id:typeof x.name==="string"?x.name:"").filter(Boolean);
 return [...new Set(ids)].slice(0,500);
}
