// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Tooltip } from "@cloudflare/kumo";
import {
  CaretDownIcon,
  CheckIcon,
  EnvelopeSimpleIcon,
  GearSixIcon,
  PlusIcon,
  RobotIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router";
import { useUIStore } from "~/hooks/useUIStore";
import { useMailbox, useMailboxes } from "~/queries/mailboxes";

export default function WorkspaceRail() {
  const { mailboxId } = useParams<{ mailboxId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: mailbox } = useMailbox(mailboxId);
  const { data: mailboxes = [] } = useMailboxes();
  const { startCompose, toggleAgentPanel, isAgentPanelOpen } = useUIStore();
  const [isMailboxMenuOpen, setIsMailboxMenuOpen] = useState(false);

  const displayName =
    mailbox?.settings?.fromName ||
    mailbox?.name ||
    mailboxId?.split("@")[0] ||
    "Mailbox";

  const accounts = useMemo(() => {
    const byId = new Map(mailboxes.map((account) => [account.id, account]));
    if (mailbox && !byId.has(mailbox.id)) byId.set(mailbox.id, mailbox);
    if (byId.size === 0 && mailboxId) {
      byId.set(mailboxId, {
        id: mailboxId,
        email: mailboxId,
        name: mailboxId.split("@")[0] || "Mailbox",
      });
    }
    return [...byId.values()];
  }, [mailboxes, mailbox, mailboxId]);

  const itemClass =
    "flex h-10 w-10 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-ring";

  const switchMailbox = (accountId: string) => {
    setIsMailboxMenuOpen(false);
    navigate(`/mailbox/${accountId}/emails/inbox`);
  };

  return (
    <aside
      aria-label="Workspace apps"
      className="hidden md:flex h-full w-[64px] shrink-0 flex-col items-center border-r border-[#e7eaf0] bg-[#f8f9fc] py-3"
    >
      <div
        className="relative z-50 mb-5"
        onBlur={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            setIsMailboxMenuOpen(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setIsMailboxMenuOpen(false);
        }}
      >
        <button
          type="button"
          aria-label="Switch mailbox"
          aria-haspopup="menu"
          aria-expanded={isMailboxMenuOpen}
          title="Switch mailbox"
          onClick={() => setIsMailboxMenuOpen((open) => !open)}
          className="group flex h-10 w-10 items-center justify-center rounded-xl bg-[#151923] text-white shadow-sm transition-transform hover:scale-[1.03] hover:bg-[#252c3b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8da0ff]"
        >
          <EnvelopeSimpleIcon size={19} weight="fill" />
          <CaretDownIcon
            size={9}
            weight="bold"
            className="absolute bottom-[7px] right-[6px] opacity-80"
          />
        </button>

        {isMailboxMenuOpen && (
          <div
            role="menu"
            aria-label="Switch mailbox"
            className="absolute left-12 top-0 z-[70] w-[286px] overflow-hidden rounded-2xl border border-[#e6e9ef] bg-white p-2 shadow-[0_18px_55px_rgba(24,35,56,0.18)]"
          >
            <div className="px-3 pb-2 pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#929bad]">
                Switch mailbox
              </p>
              <p className="mt-1 text-[12px] text-[#596579]">
                Choose an email account
              </p>
            </div>
            <div className="max-h-[min(360px,65vh)] space-y-1 overflow-y-auto">
              {accounts.map((account) => {
                const active = account.id === mailboxId;
                const name =
                  account.settings?.fromName ||
                  account.name ||
                  account.email.split("@")[0];
                return (
                  <button
                    key={account.id}
                    type="button"
                    role="menuitem"
                    onClick={() => switchMailbox(account.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      active
                        ? "bg-[#eef2ff] text-[#3349bc]"
                        : "text-[#344054] hover:bg-[#f5f7fa]"
                    }`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e7edf8] text-sm font-semibold text-[#456184]">
                      {name.trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">
                        {name}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-[#8a94a6]">
                        {account.email}
                      </span>
                    </span>
                    {active && <CheckIcon size={17} weight="bold" />}
                  </button>
                );
              })}
              {accounts.length === 0 && (
                <p className="px-3 py-4 text-[12px] text-[#929bad]">
                  No mailboxes are available yet.
                </p>
              )}
            </div>
            <div className="mt-2 border-t border-[#edf0f4] px-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsMailboxMenuOpen(false);
                  navigate("/");
                }}
                className="w-full rounded-lg px-2 py-2 text-left text-[12px] font-medium text-[#657187] transition-colors hover:bg-[#f5f7fa] hover:text-[#263248]"
              >
                Manage mailboxes
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mb-3 h-px w-7 bg-[#e4e8ef]" />

      <nav className="flex flex-col items-center gap-2" aria-label="Primary navigation">
        <Tooltip content="Mail" side="right" asChild>
          <NavLink
            to={mailboxId ? `/mailbox/${mailboxId}/emails/inbox` : "/"}
            aria-label="Mail"
            className={({ isActive }) =>
              `${itemClass} ${isActive && !location.pathname.includes("/settings") ? "bg-[#e8edff] text-[#5366d8]" : "text-[#768197] hover:bg-white hover:text-[#344054]"}`
            }
          >
            <EnvelopeSimpleIcon size={20} weight="regular" />
          </NavLink>
        </Tooltip>

        <Tooltip content="Compose email" side="right" asChild>
          <button
            type="button"
            aria-label="Compose email"
            onClick={() => startCompose()}
            className={`${itemClass} bg-[#168fe3] text-white shadow-sm hover:bg-[#087fd0]`}
          >
            <PlusIcon size={21} weight="bold" />
          </button>
        </Tooltip>

        <Tooltip content={isAgentPanelOpen ? "Hide AI assistant" : "AI assistant"} side="right" asChild>
          <button
            type="button"
            aria-label={isAgentPanelOpen ? "Hide AI assistant" : "Show AI assistant"}
            aria-pressed={isAgentPanelOpen}
            onClick={toggleAgentPanel}
            className={`${itemClass} ${isAgentPanelOpen ? "bg-[#e8edff] text-[#5366d8]" : "text-[#768197] hover:bg-white hover:text-[#344054]"}`}
          >
            <RobotIcon size={20} weight={isAgentPanelOpen ? "fill" : "regular"} />
          </button>
        </Tooltip>
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2">
        <Tooltip content="Settings" side="right" asChild>
          <NavLink
            to={mailboxId ? `/mailbox/${mailboxId}/settings` : "/"}
            aria-label="Settings"
            className={({ isActive }) =>
              `${itemClass} ${isActive || location.pathname.includes("/settings") ? "bg-[#e8edff] text-[#5366d8]" : "text-[#768197] hover:bg-white hover:text-[#344054]"}`
            }
          >
            <GearSixIcon size={20} weight="regular" />
          </NavLink>
        </Tooltip>
        <div
          title={displayName}
          aria-label={displayName}
          className="mt-1 flex h-9 w-9 items-center justify-center rounded-full border border-white bg-[#dce8f7] text-xs font-semibold text-[#37516d] shadow-sm"
        >
          {displayName.trim().charAt(0).toUpperCase()}
        </div>
      </div>
    </aside>
  );
}
