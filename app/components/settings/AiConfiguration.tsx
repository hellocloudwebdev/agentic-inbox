import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
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
  fallbacks: { chat: [], draft: [], verifier: [], scanner: [] },
  fallbackToWorkersAi: true,
};

const presets = [
  { name: "OpenRouter (Compatible)", kind: "openai-compatible" as const, baseUrl: "https://openrouter.ai/api/v1" },
  { name: "OpenAI Responses", kind: "openai-responses" as const, baseUrl: "https://api.openai.com/v1" },
  { name: "OpenAI Chat Completions", kind: "openai-chat-completions" as const, baseUrl: "https://api.openai.com/v1" },
  { name: "Groq", kind: "openai-compatible" as const, baseUrl: "https://api.groq.com/openai/v1" },
  { name: "DeepSeek", kind: "openai-compatible" as const, baseUrl: "https://api.deepseek.com" },
  { name: "Google Gemini", kind: "openai-compatible" as const, baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { name: "Anthropic Messages", kind: "anthropic" as const, baseUrl: "https://api.anthropic.com/v1" },
];

const roles = ["chat", "draft", "verifier", "scanner"] as const;

function filenameToSkillName(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readFrontmatterValue(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(?:"([^"]*)"|'([^']*)'|(.*))$`, "im"));
  return match?.[1] ?? match?.[2] ?? match?.[3]?.trim() ?? undefined;
}

export interface AiConfigurationSaveResult {
  saved: string[];
  failed: Array<{ section: string; error: string }>;
}
export interface AiConfigurationHandle {
  savePending: () => Promise<AiConfigurationSaveResult>;
}

export const AiConfiguration = forwardRef<AiConfigurationHandle>(function AiConfiguration(_props, ref) {
  const toast = useKumoToastManager();
  const query = useAiSettings();
  const saveConfig = useSaveAiConfig();
  const fetchModels = useFetchProviderModels();
  const testProvider = useTestAiProvider();
  const saveSkills = useSaveAgentSkills();

  const [config, setConfig] = useState<AiSettings["config"]>(emptyConfig);
  const [skills, setSkills] = useState<AgentSkillSettings[]>([]);
  const [providerName, setProviderName] = useState("OpenRouter");
  const [kind, setKind] = useState<"openai-compatible" | "openai-responses" | "openai-chat-completions" | "anthropic">("openai-compatible");
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
      // Migrate any older per-role configuration into one shared assistant route.
      const existing = query.data.config;
      const sharedPrimary = [existing.routing.chat, existing.routing.draft, existing.routing.verifier, existing.routing.scanner]
        .find((target) => target?.providerId && target?.model) ?? { providerId: "", model: "" };
      const sharedFallbacks = [0, 1].map((index) =>
        [existing.fallbacks?.chat?.[index], existing.fallbacks?.draft?.[index], existing.fallbacks?.verifier?.[index], existing.fallbacks?.scanner?.[index]]
          .find((target) => target?.providerId && target?.model) ?? { providerId: "", model: "" }
      );
      setConfig({
        ...existing,
        routing: { chat: sharedPrimary, draft: sharedPrimary, verifier: sharedPrimary, scanner: sharedPrimary },
        fallbacks: { chat: sharedFallbacks, draft: sharedFallbacks, verifier: sharedFallbacks, scanner: sharedFallbacks },
      });
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
      description: "Pending change — use the single Save all changes button at the bottom of Settings.",
    });
  };

  const savePending = async (): Promise<AiConfigurationSaveResult> => {
    if (query.isLoading || !query.data) {
      return { saved: [], failed: [{ section: "AI providers and skills", error: "AI settings have not finished loading. Wait for the settings panel to load, then save again." }] };
    }
    const results = await Promise.allSettled([
      saveConfig.mutateAsync(config),
      saveSkills.mutateAsync(skills),
    ]);
    const sections = ["AI providers and model routing", "Agent skills"];
    const saved: string[] = [];
    const failed: Array<{ section: string; error: string }> = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") saved.push(sections[index]);
      else failed.push({
        section: sections[index],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    });
    return { saved, failed };
  };

  useImperativeHandle(ref, () => ({ savePending }), [config, skills]);

  const route = (value: LlmRoleTarget) =>
    setConfig((old) => ({
      ...old,
      routing: { chat: value, draft: value, verifier: value, scanner: value },
    }));

  const routeFallback = (index: number, value: LlmRoleTarget) =>
    setConfig((old) => {
      const next = [
        old.fallbacks?.chat?.[0] ?? { providerId: "", model: "" },
        old.fallbacks?.chat?.[1] ?? { providerId: "", model: "" },
      ];
      next[index] = value;
      return {
        ...old,
        fallbacks: { chat: next, draft: next, verifier: next, scanner: next },
      };
    });

  const providerAndModelSelectors = (value: LlmRoleTarget, onChange: (value: LlmRoleTarget) => void) => {
    const selectedProvider = config.providers.find((provider) => provider.id === value.providerId);
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="min-w-0 text-[11px] text-kumo-subtle">
          Provider
          <select
            aria-label="Provider"
            className="mt-1 w-full min-w-0 rounded-lg border border-kumo-line bg-kumo-base p-2 text-sm text-kumo-default"
            value={value.providerId || "__workers_ai__"}
            onChange={(event) => {
              const providerId = event.target.value === "__workers_ai__" ? "" : event.target.value;
              onChange({ providerId, model: "" });
            }}
          >
            <option value="__workers_ai__">Workers AI (built-in)</option>
            {config.providers.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.name}</option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-[11px] text-kumo-subtle">
          Model
          <select
            aria-label="Model"
            className="mt-1 w-full min-w-0 rounded-lg border border-kumo-line bg-kumo-base p-2 text-sm text-kumo-default disabled:cursor-not-allowed disabled:opacity-70"
            value={value.model}
            disabled={!selectedProvider}
            onChange={(event) => onChange({ ...value, model: event.target.value })}
          >
            {!selectedProvider ? (
              <option value="">Automatic (Cloudflare Workers AI)</option>
            ) : (
              <>
                <option value="">Select a model</option>
                {selectedProvider.models.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </>
            )}
          </select>
        </label>
      </div>
    );
  };

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
    toast.add({ title: editingSkillId ? "Skill updated" : "Skill added", description: "Pending change — use the single Save all changes button at the bottom of Settings." });
    resetSkillForm();
  };

  const handleSkillUpload = async (file?: File) => {
    if (!file) return;
    if (!/\.(md|txt)$/i.test(file.name)) {
      toast.add({ title: "Upload a Markdown or text skill file (.md or .txt)", variant: "error" });
      return;
    }

    try {
      const raw = await file.text();
      const frontmatterMatch = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
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
          <p className="mt-1 text-xs text-kumo-subtle">Connect model providers and configure one shared assistant model with two ordered fallbacks.</p>
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
              <option value="openai-responses">OpenAI Responses API</option>
              <option value="openai-chat-completions">OpenAI Chat Completions</option>
              <option value="anthropic">Anthropic Messages API</option>
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
          <div>
            <div className="text-sm font-medium">One AI assistant</div>
            <p className="mt-1 text-xs text-kumo-subtle">The same assistant handles reading and searching emails, writing and sending emails, replies, drafts, folders, and skills. One model route applies consistently to every task.</p>
          </div>
          <div className="space-y-2 rounded-lg border border-kumo-line p-3">
            <div className="text-sm font-medium">AI Assistant</div>
            <div className="space-y-1">
              <div className="text-xs text-kumo-subtle">Primary model</div>
              {providerAndModelSelectors(config.routing.chat, route)}
            </div>
            {[0, 1].map((index) => (
              <div key={index} className="space-y-1">
                <div className="text-xs text-kumo-subtle">Fallback {index + 1}</div>
                {providerAndModelSelectors(config.fallbacks?.chat?.[index] ?? { providerId: "", model: "" }, (value) => routeFallback(index, value))}
              </div>
            ))}
            <p className="text-[11px] text-kumo-subtle">Fallbacks run in order. Each fallback can use a different provider and model. This shared configuration is used for every assistant task.</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={config.fallbackToWorkersAi} onChange={(event) => setConfig((old) => ({ ...old, fallbackToWorkersAi: event.target.checked }))} />
          Fall back to Workers AI if provider fails
        </label>
      </div>

      {skills.some((skill) => skill.mode === "always") && (
        <div className="rounded-xl border border-kumo-line bg-kumo-base p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-kumo-default">Existing Always-on Skills</h2>
            <p className="mt-1 text-xs text-kumo-subtle">These older skills remain active on every agent run. New skills belong in the on-demand library below.</p>
          </div>
          {skills.filter((skill) => skill.mode === "always").map((skill) => (
            <div key={skill.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-kumo-line p-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{skill.name}</div>
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
        </div>
      )}

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

        {skills.filter((skill) => skill.mode === "on-demand").map((skill) => (
          <div key={skill.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-kumo-line p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">{skill.name}</div>
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

    </section>
  );
});
