import type { ProviderKind, ProviderModel } from "./models";
export type LlmRole = "chat" | "draft" | "verifier" | "scanner";
export interface LlmProvider {
  id: string; name: string; kind: ProviderKind; baseUrl: string;
  apiKeyEnc: string; models: ProviderModel[];
}
export interface RoleTarget { providerId: string; model: string; }
export interface LlmConfig {
  providers: LlmProvider[];
  routing: Record<LlmRole, RoleTarget>;
  fallbackToWorkersAi: boolean;
}
export interface AgentSkill {
  id: string; name: string; description: string; instructions: string;
  enabled: boolean; mode: "always" | "on-demand";
}
