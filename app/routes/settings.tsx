// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { RobotIcon, ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";
import { AiConfiguration, type AiConfigurationHandle } from "~/components/settings/AiConfiguration";
import McpKeyManagement from "~/components/settings/McpKeyManagement";

const PROMPT_PLACEHOLDER = `The built-in email-agent instructions are always active. Add extra rules for this mailbox here. These instructions extend the defaults rather than replacing them.`;
type AiEmailSettings = {
  autoReplyOnIncoming: boolean;
  allowChatSendNewEmails: boolean;
  allowChatSendReplies: boolean;
  allowMcpSendNewEmails: boolean;
  allowMcpSendReplies: boolean;
};
const DEFAULT_AI_EMAIL: AiEmailSettings = {
  autoReplyOnIncoming: false,
  allowChatSendNewEmails: false,
  allowChatSendReplies: false,
  allowMcpSendNewEmails: false,
  allowMcpSendReplies: false,
};

function PermissionToggle({ title, description, checked, onChange }: {
  title: string; description: string; checked: boolean; onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 p-3 cursor-pointer">
      <span className="min-w-0">
        <span className="block text-xs font-medium text-slate-900">{title}</span>
        <span className="mt-1 block text-[11px] text-slate-600">{description}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-current" />
    </label>
  );
}

export default function SettingsRoute() {
  const { mailboxId } = useParams<{ mailboxId: string }>();
  const toastManager = useKumoToastManager();
  const { data: mailbox } = useMailbox(mailboxId);
  const updateMailboxMutation = useUpdateMailbox();
  const aiConfigurationRef = useRef<AiConfigurationHandle>(null);

  const [displayName, setDisplayName] = useState("");
  const [agentPrompt, setAgentPrompt] = useState("");
  const [aiEmail, setAiEmail] = useState<AiEmailSettings>(DEFAULT_AI_EMAIL);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!mailbox) return;
    setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
    setAgentPrompt(mailbox.settings?.agentSystemPrompt || "");
    const savedPermissions = (mailbox.settings?.aiEmail ?? {}) as Partial<AiEmailSettings> & { allowChatSend?: boolean; allowMcpSend?: boolean };
    setAiEmail({
      autoReplyOnIncoming: savedPermissions.autoReplyOnIncoming === true,
      allowChatSendNewEmails: savedPermissions.allowChatSendNewEmails ?? savedPermissions.allowChatSend ?? false,
      allowChatSendReplies: savedPermissions.allowChatSendReplies ?? savedPermissions.allowChatSend ?? false,
      allowMcpSendNewEmails: savedPermissions.allowMcpSendNewEmails ?? savedPermissions.allowMcpSend ?? false,
      allowMcpSendReplies: savedPermissions.allowMcpSendReplies ?? savedPermissions.allowMcpSend ?? false,
    });
  }, [mailbox]);

  const handleSave = async () => {
    if (!mailbox || !mailboxId || isSaving) return;
    setIsSaving(true);
    const mailboxSettings = {
      ...mailbox.settings,
      fromName: displayName.trim(),
      agentSystemPrompt: agentPrompt.trim() || undefined,
      aiEmail,
    };

    const [mailboxResult, aiResult] = await Promise.allSettled([
      updateMailboxMutation.mutateAsync({ mailboxId, settings: mailboxSettings }),
      aiConfigurationRef.current?.savePending() ?? Promise.reject(new Error("AI settings editor is not ready yet.")),
    ]);

    const saved: string[] = [];
    const failed: Array<{ section: string; error: string }> = [];
    if (mailboxResult.status === "fulfilled") {
      saved.push("Account settings", "Agent system prompt", "Email automation permissions");
    } else {
      failed.push({ section: "Account, system prompt and email permissions", error: mailboxResult.reason instanceof Error ? mailboxResult.reason.message : String(mailboxResult.reason) });
    }
    if (aiResult.status === "fulfilled") {
      saved.push(...aiResult.value.saved);
      failed.push(...aiResult.value.failed);
    } else {
      failed.push({ section: "AI providers and skills", error: aiResult.reason instanceof Error ? aiResult.reason.message : String(aiResult.reason) });
    }

    if (failed.length === 0) {
      toastManager.add({ title: "All changes saved", description: saved.join(" · ") });
    } else {
      const details = [
        ...(saved.length ? [`Saved: ${saved.join(", ")}`] : []),
        ...failed.map((item) => `${item.section}: ${item.error}`),
      ].join(" | ");
      toastManager.add({ title: `${failed.length} settings section(s) failed to save`, description: details, variant: "error" });
    }
    setIsSaving(false);
  };

  const handleResetPrompt = () => setAgentPrompt("");
  if (!mailbox) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;

  const isCustomPrompt = agentPrompt.trim().length > 0;
  return (
    <div className="max-w-3xl px-4 py-4 md:px-8 md:py-6 h-full overflow-y-auto">
      <h1 className="text-lg font-semibold text-slate-900 mb-6">Settings</h1>
      <div className="space-y-6 text-slate-900">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Account</h2>
          <div className="space-y-3">
            <Input label="Display Name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            <Input label="Email" type="email" value={mailbox.email} disabled />
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">AI email permissions</h2>
            <p className="mt-1 text-xs text-slate-600">Choose where the agent is allowed to send email. All sending permissions are off by default and enforced on the server.</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
            <PermissionToggle title="Automatic replies to incoming emails" description="When enabled, the agent may send a reply without waiting for you. When disabled, it prepares a draft instead." checked={aiEmail.autoReplyOnIncoming} onChange={(value) => setAiEmail((old) => ({ ...old, autoReplyOnIncoming: value }))} />
            <PermissionToggle title="Send new emails from AI chat" description="Allows the assistant to send a new outbound email when you explicitly ask in chat." checked={aiEmail.allowChatSendNewEmails} onChange={(value) => setAiEmail((old) => ({ ...old, allowChatSendNewEmails: value }))} />
            <PermissionToggle title="Reply to emails from AI chat" description="Allows the assistant to send a reply to an existing email when you explicitly ask in chat." checked={aiEmail.allowChatSendReplies} onChange={(value) => setAiEmail((old) => ({ ...old, allowChatSendReplies: value }))} />
            <PermissionToggle title="Send new emails through MCP" description="Allows authenticated MCP clients to send new outbound emails." checked={aiEmail.allowMcpSendNewEmails} onChange={(value) => setAiEmail((old) => ({ ...old, allowMcpSendNewEmails: value }))} />
            <PermissionToggle title="Reply to emails through MCP" description="Allows authenticated MCP clients to send replies to existing emails." checked={aiEmail.allowMcpSendReplies} onChange={(value) => setAiEmail((old) => ({ ...old, allowMcpSendReplies: value }))} />
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">AI configuration</h2>
            <p className="mt-1 text-xs text-slate-600">Manage language model providers, API credentials, model routing, agent behaviour and reusable skills.</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <RobotIcon size={16} weight="duotone" className="text-slate-600" />
                <span className="text-sm font-medium text-slate-900">Additional Agent Instructions</span>
                {isCustomPrompt ? <Badge variant="primary">Custom additions</Badge> : <Badge variant="secondary">Always included</Badge>}
              </div>
              {isCustomPrompt && <Button variant="ghost" size="xs" icon={<ArrowCounterClockwiseIcon size={14} />} onClick={handleResetPrompt}>Clear additional instructions</Button>}
            </div>
            <p className="text-xs text-slate-600 mb-3">The built-in instructions are always included. Add mailbox-specific preferences or rules here; they extend the defaults instead of replacing them.</p>
            <textarea value={agentPrompt} onChange={(event) => setAgentPrompt(event.target.value)} placeholder={PROMPT_PLACEHOLDER} rows={10} className="w-full resize-y rounded-lg border border-slate-200 bg-kumo-recessed px-3 py-2 text-xs text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-kumo-ring font-mono leading-relaxed" />
            <p className="text-xs text-slate-600 mt-2">These instructions supplement the built-in system prompt and cannot override its security rules.</p>
          </div>
          <AiConfiguration ref={aiConfigurationRef} />
        </section>

        <McpKeyManagement />

        <div className="sticky bottom-0 flex justify-end border-t border-slate-200 bg-white/95 py-3 backdrop-blur">
          <Button variant="primary" onClick={() => void handleSave()} loading={isSaving}>Save all changes</Button>
        </div>
        <p className="text-[11px] text-slate-600">Provider, skill, account, prompt and email-permission changes are saved together with one button. MCP key generation and revocation take effect immediately for security.</p>
      </div>
    </div>
  );
}
