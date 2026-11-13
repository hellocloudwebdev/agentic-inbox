import { useCallback, useEffect, useRef, useState } from "react";
import { Button, useKumoToastManager } from "@cloudflare/kumo";
import { ArrowClockwiseIcon, CopyIcon, KeyIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import api, { type McpApiKeyMetadata } from "~/services/api";

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

export default function McpKeyManagement() {
  const toast = useKumoToastManager();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [keys, setKeys] = useState<McpApiKeyMetadata[]>([]);
  const [label, setLabel] = useState("Agentic Inbox MCP");
  const [newSecret, setNewSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.listMcpKeys();
      setKeys(result.keys);
    } catch (error) {
      toastRef.current.add({ title: "Could not load MCP keys", description: error instanceof Error ? error.message : String(error), variant: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const generate = async () => {
    setBusyId("new");
    try {
      const result = await api.createMcpKey(label.trim() || "MCP client");
      setNewSecret(result.key);
      setKeys((old) => [result.keyInfo, ...old]);
      toast.add({ title: "MCP API key generated", description: "Copy it now. The full secret will not be shown again." });
    } catch (error) {
      toast.add({ title: "Could not generate MCP key", description: error instanceof Error ? error.message : String(error), variant: "error" });
    } finally { setBusyId(null); }
  };

  const regenerate = async (item: McpApiKeyMetadata) => {
    if (!window.confirm(\`Regenerate "\${item.label}"? The existing key will be revoked immediately.\`)) return;
    setBusyId(item.id);
    try {
      const result = await api.regenerateMcpKey(item.id);
      setNewSecret(result.key);
      await refresh();
      toast.add({ title: "MCP key regenerated", description: "Update your MCP client with the new key. The previous key is revoked." });
    } catch (error) {
      toast.add({ title: "Could not regenerate MCP key", description: error instanceof Error ? error.message : String(error), variant: "error" });
    } finally { setBusyId(null); }
  };

  const revoke = async (item: McpApiKeyMetadata) => {
    if (!window.confirm(\`Revoke "\${item.label}"? Connected MCP clients will stop authenticating.\`)) return;
    setBusyId(item.id);
    try {
      await api.revokeMcpKey(item.id);
      setKeys((old) => old.map((key) => key.id === item.id ? { ...key, revokedAt: new Date().toISOString(), status: "revoked" } : key));
      if (newSecret) setNewSecret("");
      toast.add({ title: "MCP key revoked" });
    } catch (error) {
      toast.add({ title: "Could not revoke MCP key", description: error instanceof Error ? error.message : String(error), variant: "error" });
    } finally { setBusyId(null); }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.add({ title: "Copied to clipboard" });
    } catch {
      toast.add({ title: "Clipboard access unavailable", description: "Select and copy the key manually.", variant: "error" });
    }
  };

  return (
    <section className="rounded-xl border border-kumo-line bg-kumo-base p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <KeyIcon size={17} weight="duotone" className="text-kumo-subtle" />
            <h2 className="text-sm font-semibold text-kumo-default">MCP API access</h2>
          </div>
          <p className="mt-1 text-xs text-kumo-subtle">Create dedicated bearer credentials for external MCP clients. API keys authorize the MCP endpoint only, not the web application or mailbox REST APIs.</p>
        </div>
        <Button variant="ghost" size="sm" icon={<ArrowClockwiseIcon size={14} />} onClick={() => void refresh()} aria-label="Refresh MCP keys" />
      </div>

      <div className="rounded-lg border border-kumo-line bg-kumo-recessed p-3 space-y-2">
        <label className="block text-xs font-medium text-kumo-strong">MCP server URL</label>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all text-xs text-kumo-default">{baseUrl}/mcp</code>
          <Button size="xs" variant="ghost" icon={<CopyIcon size={13} />} onClick={() => void copy(\`\${baseUrl}/mcp\`)} aria-label="Copy MCP URL" />
        </div>
        <label className="block text-xs font-medium text-kumo-strong pt-2">Key label</label>
        <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} className="w-full rounded-lg border border-kumo-line bg-kumo-base px-3 py-2 text-sm text-kumo-default" placeholder="For example: Cursor on laptop" />
        <Button variant="primary" size="sm" onClick={() => void generate()} loading={busyId === "new"} icon={<PlusIcon size={14} />}>Generate API key</Button>
      </div>

      {newSecret && (
        <div className="rounded-lg border border-kumo-line p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-kumo-default">New API key — copy it now</span>
            <Button size="xs" variant="secondary" icon={<CopyIcon size={13} />} onClick={() => void copy(newSecret)}>Copy key</Button>
          </div>
          <code className="block break-all rounded bg-kumo-recessed p-2 text-xs text-kumo-default select-all">{newSecret}</code>
          <p className="text-[11px] text-kumo-subtle">This is the only time the full key is displayed. Store it in your MCP client as an Authorization bearer token.</p>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-kumo-strong">Key history</h3>
          <span className="text-[11px] text-kumo-subtle">{keys.length} recorded</span>
        </div>
        {loading ? <p className="text-xs text-kumo-subtle">Loading keys…</p> : keys.length === 0 ? (
          <p className="text-xs text-kumo-subtle">No MCP API keys generated yet.</p>
        ) : keys.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-kumo-line p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-xs font-medium text-kumo-default">{item.label}</span>
                <span className={item.status === "active" ? "rounded-full bg-kumo-fill px-2 py-0.5 text-[10px] text-kumo-success" : "rounded-full bg-kumo-fill px-2 py-0.5 text-[10px] text-kumo-subtle"}>{item.status}</span>
              </div>
              <p className="mt-1 text-[11px] text-kumo-subtle">Created {formatDate(item.createdAt)}</p>
              <p className="text-[11px] text-kumo-subtle">Last used {formatDate(item.lastUsedAt)}{item.revokedAt ? \` · Revoked \${formatDate(item.revokedAt)}\` : ""}</p>
            </div>
            {item.status === "active" && (
              <div className="flex items-center gap-1">
                <Button size="xs" variant="ghost" loading={busyId === item.id} icon={<ArrowClockwiseIcon size={13} />} onClick={() => void regenerate(item)} aria-label="Regenerate key" />
                <Button size="xs" variant="ghost" loading={busyId === item.id} icon={<TrashIcon size={13} />} onClick={() => void revoke(item)} aria-label="Revoke key" />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
