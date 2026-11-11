// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { RobotIcon, ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";
import { useAgentSkills, useFetchLlmModels, useLlmConfig, useSaveAgentSkills, useSaveLlmConfig, useTestLlmModel } from "~/queries/ai-settings";
import type { AgentSkill, LlmConfig, LlmProviderInput } from "~/services/api";

// Placeholder shown in the textarea when no custom prompt is set.
// The authoritative default prompt lives in workers/agent/index.ts (DEFAULT_SYSTEM_PROMPT).
const PROMPT_PLACEHOLDER = `You are an email assistant that helps manage this inbox. You read emails, draft replies, and help organize conversations.\n\nWrite like a real person. Short, direct, flowing prose. Plain text only.\n\n(Leave empty to use the full built-in default prompt)`;

export default function SettingsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const toastManager = useKumoToastManager();
	const { data: mailbox } = useMailbox(mailboxId);
	const updateMailboxMutation = useUpdateMailbox();
	const { data: llmConfigData } = useLlmConfig();
	const { data: skillsData } = useAgentSkills();
	const saveLlmConfig = useSaveLlmConfig();
	const fetchModels = useFetchLlmModels();
	const testModel = useTestLlmModel();
	const saveSkills = useSaveAgentSkills();
	const [llmConfig, setLlmConfig] = useState<LlmConfig | null>(null);
	const [providerName, setProviderName] = useState("OpenRouter");
	const [providerKind, setProviderKind] = useState<LlmProviderInput["kind"]>("openai-compatible");
	const [providerBaseUrl, setProviderBaseUrl] = useState("https://openrouter.ai/api/v1");
	const [providerKey, setProviderKey] = useState("");
	const [providerModels, setProviderModels] = useState<{id:string;name?:string}[]>([]);
	const [testModelId, setTestModelId] = useState("");
	const [skills, setSkills] = useState<AgentSkill[]>([]);
	const [skillDraft, setSkillDraft] = useState<AgentSkill | null>(null);
	const [aiBusy, setAiBusy] = useState(false);

	const [displayName, setDisplayName] = useState("");
	const [agentPrompt, setAgentPrompt] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (llmConfigData) setLlmConfig(llmConfigData);
	}, [llmConfigData]);

	useEffect(() => {
		if (skillsData) setSkills(skillsData.skills);
	}, [skillsData]);

	useEffect(() => {
		if (mailbox) {
			setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
			setAgentPrompt(mailbox.settings?.agentSystemPrompt || "");
		}
	}, [mailbox]);

	const handleSave = async () => {
		if (!mailbox || !mailboxId) return;
		setIsSaving(true);
		const settings = {
			...mailbox.settings,
			fromName: displayName,
			agentSystemPrompt: agentPrompt.trim() || undefined,
		};
		try {
			await updateMailboxMutation.mutateAsync({ mailboxId, settings });
			toastManager.add({ title: "Settings saved!" });
		} catch {
			toastManager.add({
				title: "Failed to save settings",
				variant: "error",
			});
		} finally {
			setIsSaving(false);
		}
	};


	const updateRoute = (role: keyof LlmConfig["routing"], field: "providerId" | "model", value: string) => {
		setLlmConfig((current) => current ? {
			...current,
			routing: { ...current.routing, [role]: { ...current.routing[role], [field]: value, ...(field === "providerId" ? { model: "" } : {}) } },
		} : current);
	};
	const handleAddProvider = async () => {
		if (!llmConfig || !providerName.trim() || !providerBaseUrl.trim() || !providerKey.trim()) return;
		setAiBusy(true);
		try {
			const id = providerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
			const models = providerModels.length ? providerModels : [];
			const nextProvider: LlmProviderInput = { id, name: providerName.trim(), kind: providerKind, baseUrl: providerBaseUrl.trim(), apiKey: providerKey, models };
			const next = { ...llmConfig, providers: [...llmConfig.providers.filter((p) => p.id !== id), nextProvider] };
			const saved = await saveLlmConfig.mutateAsync(next);
			setLlmConfig(saved); setProviderKey(""); setProviderModels([]); setTestModelId("");
			toastManager.add({ title: "Provider saved" });
		} catch (error) {
			toastManager.add({ title: error instanceof Error ? error.message : "Could not save provider", variant: "error" });
		} finally { setAiBusy(false); }
	};
	const handleSaveLlm = async () => {
		if (!llmConfig) return;
		setAiBusy(true);
		try {
			const saved = await saveLlmConfig.mutateAsync(llmConfig);
			setLlmConfig(saved); toastManager.add({ title: "AI routing saved" });
		} catch (error) {
			toastManager.add({ title: error instanceof Error ? error.message : "Could not save AI settings", variant: "error" });
		} finally { setAiBusy(false); }
	};
	const handleSaveSkills = async () => {
		try { const result = await saveSkills.mutateAsync(skills); setSkills(result.skills); setSkillDraft(null); toastManager.add({ title: "Skills saved" }); }
		catch (error) { toastManager.add({ title: error instanceof Error ? error.message : "Could not save skills", variant: "error" }); }
	};

	const handleResetPrompt = () => {
		setAgentPrompt("");
	};

	if (!mailbox) {
		return (
			<div className="flex justify-center py-20">
				<Loader size="lg" />
			</div>
		);
	}

	const isCustomPrompt = agentPrompt.trim().length > 0;

	return (
		<div className="max-w-2xl px-4 py-4 md:px-8 md:py-6 h-full overflow-y-auto">
			<h1 className="text-lg font-semibold text-kumo-default mb-6">Settings</h1>

			<div className="space-y-6">
				{/* Account */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-4">
						Account
					</div>
					<div className="space-y-3">
						<Input
							label="Display Name"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
						/>
						<Input label="Email" type="email" value={mailbox.email} disabled />
					</div>
				</div>

				{/* Agent System Prompt */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2">
							<RobotIcon size={16} weight="duotone" className="text-kumo-subtle" />
							<span className="text-sm font-medium text-kumo-default">
								AI Agent Prompt
							</span>
							{isCustomPrompt ? (
								<Badge variant="primary">Custom</Badge>
							) : (
								<Badge variant="secondary">Default</Badge>
							)}
						</div>
						{isCustomPrompt && (
							<Button
								variant="ghost"
								size="xs"
								icon={<ArrowCounterClockwiseIcon size={14} />}
								onClick={handleResetPrompt}
							>
								Reset to default
							</Button>
						)}
					</div>
					<p className="text-xs text-kumo-subtle mb-3">
						Customize how the AI agent behaves for this mailbox.
						Leave empty to use the built-in default prompt.
					</p>
					<textarea
						value={agentPrompt}
						onChange={(e) => setAgentPrompt(e.target.value)}
						placeholder={PROMPT_PLACEHOLDER}
						rows={12}
						className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-xs text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring font-mono leading-relaxed"
					/>
					<p className="text-xs text-kumo-subtle mt-2">
						The prompt is sent as the system message to the AI model.
						It controls the agent's personality, writing style, and behavior rules.
					</p>
				</div>


				{/* LLM Providers */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="mb-2 text-sm font-medium text-kumo-default">LLM Providers</div>
					<p className="mb-4 text-xs text-kumo-subtle">Connect OpenAI-compatible providers, OpenRouter, Groq, Gemini, DeepSeek or Anthropic. API keys are encrypted before storage.</p>
					<div className="mb-4 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900">
						Email content, including message bodies and thread context, may be sent to the selected third-party AI provider for processing. Review that provider's privacy and data-retention terms before enabling it.
					</div>
					<label className="mb-3 block text-xs text-kumo-subtle">Quick provider preset<select className="mt-1 w-full rounded-md border border-kumo-line bg-kumo-recessed p-2 text-sm text-kumo-default" defaultValue="openrouter" onChange={(e)=>{const presets:Record<string,{name:string,url:string,kind:LlmProviderInput["kind"]}>={openrouter:{name:"OpenRouter",url:"https://openrouter.ai/api/v1",kind:"openai-compatible"},openai:{name:"OpenAI",url:"https://api.openai.com/v1",kind:"openai-compatible"},groq:{name:"Groq",url:"https://api.groq.com/openai/v1",kind:"openai-compatible"},gemini:{name:"Google Gemini",url:"https://generativelanguage.googleapis.com/v1beta/openai",kind:"openai-compatible"},deepseek:{name:"DeepSeek",url:"https://api.deepseek.com/v1",kind:"openai-compatible"},anthropic:{name:"Anthropic",url:"https://api.anthropic.com",kind:"anthropic"}};const p=presets[e.target.value];if(p){setProviderName(p.name);setProviderBaseUrl(p.url);setProviderKind(p.kind);}}}><option value="openrouter">OpenRouter</option><option value="openai">OpenAI</option><option value="groq">Groq</option><option value="gemini">Google Gemini</option><option value="deepseek">DeepSeek</option><option value="anthropic">Anthropic</option></select></label>
					<div className="grid gap-3 sm:grid-cols-2">
						<label className="text-xs text-kumo-subtle">Provider name<input className="mt-1 w-full rounded-md border border-kumo-line bg-kumo-recessed p-2 text-sm text-kumo-default" value={providerName} onChange={(e)=>setProviderName(e.target.value)} /></label>
						<label className="text-xs text-kumo-subtle">Provider type<select className="mt-1 w-full rounded-md border border-kumo-line bg-kumo-recessed p-2 text-sm text-kumo-default" value={providerKind} onChange={(e)=>setProviderKind(e.target.value as LlmProviderInput["kind"])}><option value="openai-compatible">OpenAI-compatible</option><option value="anthropic">Anthropic</option></select></label>
					</div>
					<label className="mt-3 block text-xs text-kumo-subtle">Base URL<input className="mt-1 w-full rounded-md border border-kumo-line bg-kumo-recessed p-2 text-sm text-kumo-default" value={providerBaseUrl} onChange={(e)=>setProviderBaseUrl(e.target.value)} /></label>
					<label className="mt-3 block text-xs text-kumo-subtle">API key<input type="password" autoComplete="new-password" className="mt-1 w-full rounded-md border border-kumo-line bg-kumo-recessed p-2 text-sm text-kumo-default" value={providerKey} onChange={(e)=>setProviderKey(e.target.value)} placeholder="Paste provider API key" /></label>
					<div className="mt-3 flex flex-wrap gap-2">
						<Button size="sm" variant="secondary" loading={fetchModels.isPending} disabled={!providerKey.trim()} onClick={async()=>{try{const r=await fetchModels.mutateAsync({kind:providerKind,baseUrl:providerBaseUrl,apiKey:providerKey});setProviderModels(r.models);toastManager.add({title:`Found ${r.models.length} models`});}catch(e){toastManager.add({title:e instanceof Error?e.message:"Model discovery failed",variant:"error"});}}}>Fetch models</Button>
						<Button size="sm" variant="primary" loading={aiBusy} disabled={!providerKey.trim()} onClick={handleAddProvider}>Save provider</Button>
					</div>
					{providerModels.length>0 && <div className="mt-3 flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-xs text-kumo-subtle">Test model<select className="mt-1 w-full rounded-md border border-kumo-line bg-kumo-recessed p-2 text-sm text-kumo-default" value={testModelId} onChange={(e)=>setTestModelId(e.target.value)}><option value="">Choose a model</option>{providerModels.map((m)=><option key={m.id} value={m.id}>{m.name||m.id}</option>)}</select></label><Button size="sm" variant="secondary" loading={testModel.isPending} disabled={!testModelId || !providerKey.trim()} onClick={async()=>{try{const id=providerName.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");const r=await testModel.mutateAsync({providerId:id,model:testModelId,role:"chat"});if(!r.ok)throw new Error(r.error||"Model test failed");toastManager.add({title:"Model connection successful"});}catch(e){toastManager.add({title:e instanceof Error?e.message:"Model test failed",variant:"error"});}}}>Test model</Button><span className="text-xs text-kumo-subtle">{providerModels.length} models discovered</span></div>}
					<div className="mt-5 space-y-2">
						{llmConfig?.providers.map((provider)=><div key={provider.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-kumo-line p-3"><div><div className="text-sm font-medium text-kumo-default">{provider.name}</div><div className="text-xs text-kumo-subtle">{provider.baseUrl} · {provider.models.length} models · {provider.hasKey?"Key stored":"Missing key"}</div></div><Button size="xs" variant="ghost" onClick={()=>setLlmConfig((current)=>current?{...current,providers:current.providers.filter((p)=>p.id!==provider.id)}:current)}>Remove</Button></div>)}
					</div>
					{llmConfig && <div className="mt-5 space-y-3 border-t border-kumo-line pt-4">
						<div className="text-sm font-medium text-kumo-default">Model routing</div>
						{(["chat","draft","verifier","scanner"] as const).map((role)=><div key={role} className="grid gap-2 sm:grid-cols-2"><label className="text-xs capitalize text-kumo-subtle">{role} provider<select className="mt-1 w-full rounded-md border border-kumo-line bg-kumo-recessed p-2 text-sm text-kumo-default" value={llmConfig.routing[role].providerId} onChange={(e)=>updateRoute(role,"providerId",e.target.value)}><option value="workers-ai">Cloudflare Workers AI</option>{llmConfig.providers.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="text-xs capitalize text-kumo-subtle">{role} model<select className="mt-1 w-full rounded-md border border-kumo-line bg-kumo-recessed p-2 text-sm text-kumo-default" value={llmConfig.routing[role].model} onChange={(e)=>updateRoute(role,"model",e.target.value)}>{llmConfig.routing[role].providerId==="workers-ai" ? <option value={llmConfig.routing[role].model}>{llmConfig.routing[role].model}</option> : llmConfig.providers.find((p)=>p.id===llmConfig.routing[role].providerId)?.models.map((m)=><option key={m.id} value={m.id}>{m.name||m.id}</option>)}</select></label></div>)}
						<label className="flex items-center gap-2 text-sm text-kumo-default"><input type="checkbox" checked={llmConfig.fallbackToWorkersAi} onChange={(e)=>setLlmConfig({...llmConfig,fallbackToWorkersAi:e.target.checked})}/> Fall back to Workers AI if a provider fails</label>
						<div className="flex justify-end"><Button variant="primary" onClick={handleSaveLlm} loading={aiBusy}>Save AI settings</Button></div>
					</div>}
				</div>

				{/* Agent Skills */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="mb-2 text-sm font-medium text-kumo-default">Agent Skills</div>
					<p className="mb-4 text-xs text-kumo-subtle">Add reusable instructions to the agent. Always-on skills are included in every system prompt; on-demand skills load only when requested by the agent.</p>
					<div className="space-y-2">{skills.map((skill)=><div key={skill.id} className="flex items-center justify-between gap-3 rounded-lg border border-kumo-line p-3"><div className="min-w-0"><div className="truncate text-sm font-medium text-kumo-default">{skill.name}</div><div className="truncate text-xs text-kumo-subtle">{skill.description} · {skill.mode}</div></div><div className="flex shrink-0 items-center gap-2"><input aria-label={`Enable ${skill.name}`} type="checkbox" checked={skill.enabled} onChange={(e)=>setSkills((current)=>current.map((s)=>s.id===skill.id?{...s,enabled:e.target.checked}:s))}/><Button size="xs" variant="ghost" onClick={()=>setSkillDraft({...skill})}>Edit</Button></div></div>)}</div>
					{skillDraft && <div className="mt-4 space-y-2 rounded-lg border border-kumo-line p-3"><input className="w-full rounded-md border border-kumo-line bg-kumo-recessed p-2 text-sm" placeholder="Skill name" value={skillDraft.name} onChange={(e)=>setSkillDraft({...skillDraft,name:e.target.value})}/><input className="w-full rounded-md border border-kumo-line bg-kumo-recessed p-2 text-sm" placeholder="Short description" value={skillDraft.description} onChange={(e)=>setSkillDraft({...skillDraft,description:e.target.value})}/><select className="w-full rounded-md border border-kumo-line bg-kumo-recessed p-2 text-sm" value={skillDraft.mode} onChange={(e)=>setSkillDraft({...skillDraft,mode:e.target.value as AgentSkill["mode"]})}><option value="always">Always include</option><option value="on-demand">Load on demand</option></select><textarea rows={6} className="w-full rounded-md border border-kumo-line bg-kumo-recessed p-2 text-xs font-mono" placeholder="Full skill instructions" value={skillDraft.instructions} onChange={(e)=>setSkillDraft({...skillDraft,instructions:e.target.value})}/><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={()=>setSkillDraft(null)}>Cancel</Button><Button size="sm" variant="primary" onClick={()=>{setSkills((current)=>current.some((s)=>s.id===skillDraft.id)?current.map((s)=>s.id===skillDraft.id?skillDraft:s):[...current,skillDraft]);setSkillDraft(null);}}>Apply</Button></div></div>}
					<div className="mt-4 flex flex-wrap justify-between gap-2"><Button size="sm" variant="secondary" onClick={()=>setSkillDraft({id:crypto.randomUUID(),name:"New skill",description:"What this skill helps the agent do",instructions:"",enabled:true,mode:"on-demand"})}>Add skill</Button><Button size="sm" variant="primary" loading={saveSkills.isPending} onClick={handleSaveSkills}>Save skills</Button></div>
				</div>

				{/* Save */}
				<div className="flex justify-end">
					<Button variant="primary" onClick={handleSave} loading={isSaving}>
						Save Changes
					</Button>
				</div>
			</div>
		</div>
	);
}
