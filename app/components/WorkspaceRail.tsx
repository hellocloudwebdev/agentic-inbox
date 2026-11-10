// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Tooltip } from "@cloudflare/kumo";
import {
  EnvelopeSimpleIcon,
  GearSixIcon,
  PlusIcon,
  RobotIcon,
} from "@phosphor-icons/react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router";
import { useUIStore } from "~/hooks/useUIStore";
import { useMailbox } from "~/queries/mailboxes";

export default function WorkspaceRail() {
  const { mailboxId } = useParams<{ mailboxId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: mailbox } = useMailbox(mailboxId);
  const { startCompose, toggleAgentPanel, isAgentPanelOpen } = useUIStore();

  const displayName =
    mailbox?.settings?.fromName ||
    mailbox?.name ||
    mailboxId?.split("@")[0] ||
    "Mailbox";

  const itemClass =
    "flex h-10 w-10 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-ring";

  return (
    <aside
      aria-label="Workspace apps"
      className="hidden md:flex h-full w-[60px] shrink-0 flex-col items-center border-r border-[#e7eaf0] bg-[#f7f8fb] py-3"
    >
      <button
        type="button"
        aria-label="Go to inbox"
        title="Agentic Inbox"
        onClick={() => navigate(mailboxId ? `/mailbox/${mailboxId}/emails/inbox` : "/")}
        className="mb-5 flex h-9 w-9 items-center justify-center rounded-xl bg-[#1c2434] text-white shadow-sm transition-transform hover:scale-[1.03]"
      >
        <EnvelopeSimpleIcon size={19} weight="fill" />
      </button>

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
            className={`${itemClass} bg-[#5366d8] text-white shadow-sm hover:bg-[#4658c4]`}
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
