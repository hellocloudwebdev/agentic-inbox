import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { AiSettings } from "~/services/api";
const key=["ai-settings"] as const;
export function useAiSettings(){
 return useQuery({queryKey:key,queryFn:()=>api.getAiSettings()});
}
export function useSaveAiConfig(){
 const qc=useQueryClient();
 return useMutation({mutationFn:(config:AiSettings["config"])=>api.saveAiConfig(config),onSuccess:()=>qc.invalidateQueries({queryKey:key})});
}
export function useFetchProviderModels(){
 return useMutation({mutationFn:(input:{kind:"openai-compatible"|"anthropic";baseUrl:string;apiKey:string})=>api.fetchProviderModels(input)});
}
export function useTestAiProvider(){
 return useMutation({mutationFn:(input:{providerId:string;model:string})=>api.testAiProvider(input)});
}
export function useSaveAgentSkills(){
 const qc=useQueryClient();
 return useMutation({mutationFn:(skills:AiSettings["skills"])=>api.saveAgentSkills(skills),onSuccess:()=>qc.invalidateQueries({queryKey:key})});
}
