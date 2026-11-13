export type LlmRole = "chat" | "draft" | "verifier" | "scanner";
export type ProviderKind = "openai-compatible" | "openai-responses" | "openai-chat-completions" | "anthropic";
export interface LlmProvider {
  id: string; name: string; kind: ProviderKind; baseUrl: string;
  apiKeyEnc?: string; models: string[];
}
export interface RoleTarget { providerId: string; model: string }
export interface LlmConfig {
  providers: LlmProvider[];
  routing: Record<LlmRole, RoleTarget>;
  /** Ordered secondary provider/model choices per role. The primary remains in routing. */
  fallbacks?: Partial<Record<LlmRole, RoleTarget[]>>;
  fallbackToWorkersAi: boolean;
}
export interface AgentSkillResource {
  path: string;
  content: string;
  mediaType?: string;
}
export interface AgentSkill {
  id: string; name: string; description: string; instructions: string;
  enabled: boolean; mode: "always" | "on-demand";
  resources?: AgentSkillResource[];
  manifest?: Record<string, unknown>;
  source?: string;
}
