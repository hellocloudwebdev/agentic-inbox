import { describe, expect, it } from "vitest";
import type { AgentSkill } from "../workers/lib/llm/types";
import { upsertAgentSkill } from "../workers/agent/skills";

describe("upsertAgentSkill", () => {
  it("creates a new enabled on-demand skill", () => {
    const result = upsertAgentSkill([], {
      name: "  Inbox triage  ",
      description: "Sort and prioritize incoming mail",
      instructions: "Read the sender, urgency, and requested action.",
    }, () => "skill-1");

    expect(result.action).toBe("created");
    expect(result.skill).toEqual({
      id: "skill-1",
      name: "Inbox triage",
      description: "Sort and prioritize incoming mail",
      instructions: "Read the sender, urgency, and requested action.",
      enabled: true,
      mode: "on-demand",
    });
    expect(result.skills).toHaveLength(1);
  });

  it("preserves imported supporting files and manifest when a learned skill updates the same name", () => {
    const existing: AgentSkill = {
      id: "imported-id",
      name: "Email Review",
      description: "Imported skill",
      instructions: "Use the reference checklist.",
      enabled: true,
      mode: "on-demand",
      resources: [{ path: "references/checklist.md", content: "Check the sender." }],
      manifest: { license: "MIT" },
      source: "bundle.zip",
    };
    const result = upsertAgentSkill([existing], {
      name: "email review",
      description: "Updated instructions",
      instructions: "Apply the updated review process.",
    });
    expect(result.skill.resources).toEqual(existing.resources);
    expect(result.skill.manifest).toEqual(existing.manifest);
    expect(result.skill.source).toBe("bundle.zip");
  });

  it("updates an existing skill by case-insensitive name without creating a duplicate", () => {
    const existing: AgentSkill = {
      id: "existing-id",
      name: "Inbox triage",
      description: "Old description",
      instructions: "Old instructions",
      enabled: false,
      mode: "always",
    };
    const result = upsertAgentSkill([existing], {
      name: "INBOX TRIAGE",
      description: "Updated description",
      instructions: "Updated instructions",
    }, () => "unexpected-new-id");

    expect(result.action).toBe("updated");
    expect(result.skills).toHaveLength(1);
    expect(result.skill.id).toBe("existing-id");
    expect(result.skill.enabled).toBe(true);
    expect(result.skill.mode).toBe("on-demand");
    expect(result.skill.instructions).toBe("Updated instructions");
  });
});
