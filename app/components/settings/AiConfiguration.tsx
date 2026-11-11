import { useEffect, useRef, useState } from "react";
import { Button, useKumoToastManager } from "@cloudflare/kumo";
import {
  useAiSettings,
  useFetchProviderModels,
  useSaveAiConfig,
  useSaveAgentSkills,
  useTestAiProvider,
} from "~/queries/ai-settings";
import type {
  AiSettings,
  LlmProviderSettings,
  AgentSkillSettings,
  LlmRoleTarget,
} from "~/services/api";

const emptyConfig: AiSettings["config"] = {
  providers: [],
  routing: {
    chat: { providerId: "", model: "" },
    draft: { providerId: "", model: "" },
    verifier: { providerId: "", model: "" },
    scanner: { providerId: "", model: "" },
  },
  fallbackToWorkersAi: true,
};

const presets = [
  { name: "OpenRouter", kind: "openai-compatible" as const, baseUrl: "https://openrouter.ai/api/v1" },
  { name: "Groq", kind: "openai-compatible" as const, baseUrl: "https://api.groq.com/openai/v1" },
  { name: "DeepSeek", kind: "openai-compatible" as const, baseUrl: "https://api.deepseek.com" },
  { name: "Google Gemini", kind: "openai-compatible" as const, baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { name: "Anthropic", kind: "anthropic" as const, baseUrl: "https://api.anthropic.com/v1" },
];

const roles = ["chat", "draft", "verifier", "scanner"] as const;

function filenameToSkillName(filename: string) {
  return filename
    .replace(/\\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\\b\\w/g, (letter) => letter.toUpperCase());
}

function readFrontmatterValue(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(?:"([^"]*)"|'([^']*)'|(.*))$`, "im"));
  return match?.[1] ?? match?.[2] ?? match?.[3]?.trim() ?? undefined;
}

export function AiConfiguration() {
  const toast = useKumoToastManager();
  const query = useAiSettings();
  const saveConfig = useSaveAiConfig();
  const fetchModels = useFetchProviderModels();
  const testProvider = useTestAiProvider();
  const saveSkills = useSaveAgentSkills();

  const [config, setConfig] = useState<AiSettings["config"]>(emptyConfig);
  const [skills, setSkills] = useState<AgentSkillSettings[]>([]);
  const [providerName, setProviderName] = useState("OpenRouter");
  const [kind, setKind] = useState<"openai-compatible" | "anthropic">("openai-compatible");
  const [baseUrl, setBaseUrl] = useState(presets[0].baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [skillName, setSkillName] = useState("");
  const [skillDescription, setSkillDescription] = useState("");
  const [skillInstructions, setSkillInstructions] = useState("");
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const skillFileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (query.data) {
      setConfig(query.data.config);
      setSkills(query.data.skills);
    }
  }, [query.data]);

  const applyPreset = (name: string) => {
    const preset = presets.find((item) => item.name === name);
    if (preset) {
      setProviderName(preset.name);
      setKind(preset.kind);
      setBaseUrl(preset.baseUrl);
    }
  };

  const fetch = async () => {
    try {
      const result = await fetchModels.mutateAsync({ kind, baseUrl, apiKey });
      setModels(result.models);
      setSelectedModel(result.models[0] ?? "");
      toast.add({ title: `Fetched ${result.models.length} models` });
    } catch (error) {
      toast.add({ title: "Could not fetch models", description: (error as Error).message, variant: "error" });
    }
  };

  const addProvider = () => {
    if (!providerName.trim() || !models.length) return;
    const id = editingProviderId ?? providerName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const provider: LlmProviderSettings = {
      id,
      name: providerName,
      kind,
      baseUrl,
      models,
      hasKey: !!apiKey || !!config.providers.find((item) => item.id === id)?.hasKey,
      ...(apiKey ? { apiKey } : {}),
    };
    setConfig((old) => ({
      ...old,
      providers: [...old.providers.filter((item) => item.id !== id), provider],
    }));
    setApiKey("");
    setEditingProviderId(null);
    toast.add({
      title: editingProviderId ? "Provider updated" : "Provider added",
      description: "Save AI settings to persist your changes.",
    });
  };

  const save = async () => {
    try {
      await saveConfig.mutateAsync(config);
      await saveSkills.mutateAsync(skills);
      toast.add({ title: "AI settings saved" });
    } catch (error) {
      toast.add({ title: "Save failed", description: (error as Error).message, variant: "error" });
    }
  };

  const route = (role: typeof roles[number], value: LlmRoleTarget) =>
    setConfig((old) => ({ ...old, routing: { ...old.routing, [role]: value } }));

  const resetSkillForm = () => {
    setSkillName("");
    setSkillDescription("");
    setSkillInstructions("");
    setEditingSkillId(null);
  };

  const addSkill = () => {
    if (!skillName.trim() || !skillDescription.trim() || !skillInstructions.trim()) {
      toast.add({ title: "Complete all skill fields before adding it", variant: "error" });
      return;
    }

    const value = {
      name: skillName.trim(),
      description: skillDescription.trim(),
      instructions: skillInstructions.trim(),
      mode: "on-demand" as const,
    };

    setSkills((old) => {
      if (!editingSkillId) {
        return [...old, { id: crypto.randomUUID(), ...value, enabled: true }];
      }
      return old.map((skill) =>
        skill.id === editingSkillId ? { ...skill, ...value } : skill,
      );
    });
    toast.add({ title: editingSkillId ? "Skill updated" : "Skill added", description: "Save AI settings to persist it." });
    resetSkillForm();
  };

  const handleSkillUpload = async (file?: File) => {
    if (!file) return;
    if (!/\\.(md|txt)$/i.test(file.name)) {
      toast.add({ title: "Upload a Markdown or text skill file (.md or .txt)", variant: "error" });
      return;
    }

    try {
      const raw = await file.text();
      const frontmatterMatch = raw.match(/^---\\s*\\r?\\n([\\s\\S]*?)\\r?\\n---\\s*\\r?\\n?/);
      const frontmatter = frontmatterMatch?.[1] ?? "";
      const instructions = (frontmatterMatch ? raw.slice(frontmatterMatch[0].length) : raw).trim();
      if (!instructions) {
        toast.add({ title: "The uploaded skill file is empty", variant: "error" });
        return;
      }
      if (instructions.length > 12000) {
        toast.add({ title: "Skill instructions must be 12,000 characters or fewer", variant: "error" });
        return;
      }

      setSkillName(readFrontmatterValue(frontmatter, "name") || filenameToSkillName(file.name));
      setSkillDescription(
        readFrontmatterValue(frontmatter, "description") ||
        `Imported from ${file.name}`.slice(0, 500),
      );
      setSkillInstructions(instructions);
      setEditingSkillId(null);
      toast.add({ title: "Skill file loaded", description: "Review the details, then add the skill." });
    } catch (error) {
      toast.add({ title: "Could not read skill file", description: (error as Error).message, variant: "error" });
    } finally {
      if (skillFileInput.current) skillFileInput.current.value = "";
    }
  };

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-kumo-line bg-kumo-base p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-kumo-default">AI Providers</h2>
          <p className="mt-1 text-xs text-kumo-subtle">Connect model providers and route each agent task to its preferred model.</p>
        </div>
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900">
          Privacy notice: email content and prompts are sent to the selected third-party AI provider when that provider handles a task. Review its data-retention and privacy policies before connecting it.
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-kumo-subtle">
            Provider preset
            <select className="mt-1 w-full rounded-lg border border-kumo-line bg-kumo-base p-2 text-sm" onChange={(event) => applyPreset(event.target.value)}>
              {presets.map((preset) => <option key={preset.name}>{preset.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-kumo-subtle">
            Provider name
            <input className="mt-1 w-full rounded-lg border border-kumo-line bg-kumo-base p-2 text-sm" value={providerName} onChange={(event) => setProviderName(event.target.value)} />
          </label>
          <label className="text-xs text-kumo-subtle">
            API type
            <select className="mt-1 w-full rounded-lg border border-kumo-line bg-kumo-base p-2 text-sm" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              <option value="openai-compatible">OpenAI-compatible</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </label>
          <label className="text-xs text-kumo-subtle">
            Base URL
            <input className="mt-1 w-full rounded-lg border border-kumo-line bg-kumo-base p-2 text-sm" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
          </label>
          <label className="text-xs text-kumo-subtle sm:col-span-2">
            API key
            <input type="password" autoComplete="new-password" className="mt-1 w-full rounded-lg border border-kumo-line bg-kumo-base p-2 text-sm" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={editingProviderId ? "Leave blank to keep the saved key" : "Paste provider API key"} />
            <p className="text-xs text-kumo-subtle sm:col-span-2">Provider URL and encrypted API key are saved in your app's Neon settings. They are not stored as Cloudflare Worker variables.</p>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={fetch} loading={fetchModels.isPending} disabled={!apiKey.trim()}>Fetch models</Button>
          <select aria-label="Available model" className="min-w-0 flex-1 rounded-lg border border-kumo-line bg-kumo-base p-2 text-sm" value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
            <option value="">Select fetched model</option>
            {models.map((model) => <option key={model}>{model}</option>)}
          </select>
          <Button variant="secondary" onClick={addProvider} disabled={!selectedModel}>{editingProviderId ? "Update provider" : "Add provider"}</Button>
        </div>
        <div className="space-y-2">
          {config.providers.map((provider) => (
            <div key={provider.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-kumo-line p-3">
              <div>
                <div className="text-sm font-medium">{provider.name}</div>
                <div className="text-xs text-kumo-subtle">{provider.models.length} models · {provider.hasKey ? "API key saved" : "API key missing"} · {provider.baseUrl}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => {
                  setEditingProviderId(provider.id);
                  setProviderName(provider.name);
                  setKind(provider.kind);
                  setBaseUrl(provider.baseUrl);
                  setModels(provider.models);
                  setSelectedModel(provider.models[0] ?? "");
                  setApiKey("");
                }}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfig((old) => ({
                  ...old,
                  providers: old.providers.filter((item) => item.id !== provider.id),
                  routing: Object.fromEntries(roles.map((role) => [
                    role,
                    old.routing[role].providerId === provider.id ? { providerId: "", model: "" } : old.routing[role],
                  ])) as AiSettings["config"]["routing"],
                }))}>Remove</Button>
                <Button size="sm" variant="secondary" onClick={async () => {
                  try {
                    const result = await testProvider.mutateAsync({ providerId: provider.id, model: provider.models[0] });
                    toast.add({ title: result.ok ? "Provider connection successful" : "Provider test failed", description: result.response || result.error, variant: result.ok ? "success" : "error" });
                  } catch (error) {
                    toast.add({ title: "Provider test failed", description: (error as Error).message, variant: "error" });
                  }
                }} loading={testProvider.isPending}>Test</Button>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-3 border-t border-kumo-line pt-4">
          <div className="text-sm font-medium">Model routing</div>
          {roles.map((role) => (
            <label key={role} className="grid gap-1 text-xs capitalize text-kumo-subtle sm:grid-cols-[100px_1fr] sm:items-center">
              <span>{role}</span>
              <select
                className="w-full rounded-lg border border-kumo-line bg-kumo-base p-2 text-sm"
                value={config.routing[role].providerId + "|" + config.routing[role].model}
                onChange={(event) => {
                  const [providerId, model] = event.target.value.split("|");
                  route(role, { providerId, model });
                }}
              >
                <option value="|">Workers AI (built-in)</option>
                {config.providers.flatMap((provider) => provider.models.map((model) => (
                  <option key={provider.id + "|" + model} value={provider.id + "|" + model}>{provider.name} / {model}</option>
                )))}
              </select>
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={config.fallbackToWorkersAi} onChange={(event) => setConfig((old) => ({ ...old, fallbackToWorkersAi: event.target.checked }))} />
          Fall back to Workers AI if provider fails
        </label>
      </div>

      <div className="rounded-xl border border-kumo-line bg-kumo-base p-5 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-kumo-default">On-demand Skills</h2>
            <span className="rounded-full bg-kumo-fill px-2 py-0.5 text-[10px] font-medium text-kumo-subtle">Loaded when relevant</span>
          </div>
          <p className="mt-1 text-xs text-kumo-subtle">
            Save reusable workflows and instructions here. The agent loads a skill only when it is relevant. You can type a skill, upload a .md or .txt file, or teach the agent a skill directly in chat.
          </p>
        </div>

        {skills.map((skill) => (
          <div key={skill.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-kumo-line p-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-medium">{skill.name}</div>
                <span className="rounded-full bg-kumo-fill px-2 py-0.5 text-[10px] text-kumo-subtle">
                  {skill.mode === "always" ? "Existing always-on skill" : "On demand"}
                </span>
              </div>
              <div className="text-xs text-kumo-subtle">{skill.description}</div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs">
                <input type="checkbox" checked={skill.enabled} onChange={(event) => setSkills((old) => old.map((item) => item.id === skill.id ? { ...item, enabled: event.target.checked } : item))} /> Enabled
              </label>
              <Button size="xs" variant="ghost" onClick={() => {
                setEditingSkillId(skill.id);
                setSkillName(skill.name);
                setSkillDescription(skill.description);
                setSkillInstructions(skill.instructions);
              }}>Edit</Button>
              <Button size="xs" variant="ghost" onClick={() => setSkills((old) => old.filter((item) => item.id !== skill.id))}>Remove</Button>
            </div>
          </div>
        ))}

        <div className="grid gap-2">
          <input className="rounded-lg border border-kumo-line bg-kumo-base p-2 text-sm" placeholder="Skill name" value={skillName} onChange={(event) => setSkillName(event.target.value)} />
          <input className="rounded-lg border border-kumo-line bg-kumo-base p-2 text-sm" placeholder="Short description" value={skillDescription} onChange={(event) => setSkillDescription(event.target.value)} />
          <textarea className="rounded-lg border border-kumo-line bg-kumo-base p-2 text-sm" rows={5} placeholder="Full skill instructions" value={skillInstructions} onChange={(event) => setSkillInstructions(event.target.value)} />
          <input
            ref={skillFileInput}
            type="file"
            accept=".md,.txt,text/markdown,text/plain"
            className="hidden"
            onChange={(event) => void handleSkillUpload(event.target.files?.[0])}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => skillFileInput.current?.click()}>Upload skill (.md / .txt)</Button>
            <div className="flex gap-2">
              {editingSkillId && <Button variant="ghost" onClick={resetSkillForm}>Cancel</Button>}
              <Button variant="secondary" onClick={addSkill}>{editingSkillId ? "Update skill" : "Add skill"}</Button>
            </div>
          </div>
          <p className="text-[11px] text-kumo-subtle">Markdown files may include optional YAML frontmatter with name and description. Skill instructions are limited to 12,000 characters.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="primary" onClick={save} loading={saveConfig.isPending || saveSkills.isPending}>Save AI settings</Button>
      </div>
    </section>
  );
}
