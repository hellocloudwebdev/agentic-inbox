import type { AgentSkill } from "../lib/llm/types";

export interface AgentSkillDraft {
  name: string;
  description: string;
  instructions: string;
}

export function upsertAgentSkill(
  skills: AgentSkill[],
  draft: AgentSkillDraft,
  createId: () => string = () => crypto.randomUUID(),
): { skills: AgentSkill[]; skill: AgentSkill; action: "created" | "updated" } {
  const name = draft.name.trim();
  const description = draft.description.trim();
  const instructions = draft.instructions.trim();
  const existingIndex = skills.findIndex(
    (skill) => skill.name.trim().toLowerCase() === name.toLowerCase(),
  );
  const existing = existingIndex >= 0 ? skills[existingIndex] : undefined;

  const skill: AgentSkill = {
    id: existing?.id ?? createId(),
    name,
    description,
    instructions,
    enabled: true,
    mode: "on-demand",
  };

  if (existingIndex < 0) {
    return { skills: [...skills, skill], skill, action: "created" };
  }

  const next = [...skills];
  next[existingIndex] = skill;
  return { skills: next, skill, action: "updated" };
}
