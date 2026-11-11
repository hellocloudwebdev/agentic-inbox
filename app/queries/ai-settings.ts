import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api, { type AgentSkill, type LlmConfig, type LlmProviderInput } from "~/services/api";

const keys = {
  config: ["ai-settings", "llm-config"] as const,
  skills: ["ai-settings", "skills"] as const,
};
export function useLlmConfig() {
  return useQuery({ queryKey: keys.config, queryFn: () => api.getLlmConfig() });
}
export function useSaveLlmConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: LlmConfig) => api.putLlmConfig(config),
    onSuccess: (config) => qc.setQueryData(keys.config, config),
  });
}
export function useFetchLlmModels() {
  return useMutation({
    mutationFn: (input: { kind: LlmProviderInput["kind"]; baseUrl: string; apiKey: string }) => api.fetchLlmModels(input),
  });
}
export function useTestLlmModel() {
  return useMutation({
    mutationFn: (input: { providerId: string; model: string; role?: keyof LlmConfig["routing"] }) => api.testLlmModel(input),
  });
}
export function useAgentSkills() {
  return useQuery({ queryKey: keys.skills, queryFn: () => api.getAgentSkills() });
}
export function useSaveAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skills: AgentSkill[]) => api.putAgentSkills(skills),
    onSuccess: (result) => qc.setQueryData(keys.skills, result),
  });
}
