// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useEffect, useRef } from "react";
import { Outlet, useParams } from "react-router";
import { XIcon } from "@phosphor-icons/react";
import AgentSidebar from "~/components/AgentSidebar";
import ComposeEmail from "~/components/ComposeEmail";
import Header from "~/components/Header";
import Sidebar from "~/components/Sidebar";
import WorkspaceRail from "~/components/WorkspaceRail";
import { useMailbox } from "~/queries/mailboxes";
import { useUIStore } from "~/hooks/useUIStore";

export default function MailboxRoute() {
  const { mailboxId } = useParams<{ mailboxId: string }>();
  // Prefetch mailbox data for child components.
  useMailbox(mailboxId);
  const prevMailboxIdRef = useRef<string | undefined>(undefined);
  const {
    isSidebarOpen,
    closeSidebar,
    isAgentPanelOpen,
    closePanel,
    closeComposeModal,
  } = useUIStore();

  useEffect(() => {
    if (
      prevMailboxIdRef.current &&
      mailboxId &&
      prevMailboxIdRef.current !== mailboxId
    ) {
      closePanel();
      closeComposeModal();
      closeSidebar();
    }

    prevMailboxIdRef.current = mailboxId;
  }, [mailboxId, closeComposeModal, closePanel, closeSidebar]);

  return (
    <div className="flex h-[100dvh] min-h-[100svh] overflow-hidden bg-[#f6f7fb]">
      {/* Compact app rail: desktop only. */}
      <WorkspaceRail />

      {/* Mobile sidebar overlay backdrop. */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/25 backdrop-blur-[1px] md:hidden"
          onClick={closeSidebar}
          onKeyDown={(e) => e.key === "Escape" && closeSidebar()}
          role="button"
          tabIndex={-1}
          aria-label="Close sidebar"
        />
      )}

      {/* Mailbox folders: a drawer on mobile, a fixed column on desktop. */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-60 transform transition-transform duration-200 ease-in-out md:relative md:z-0 md:translate-x-0 md:shrink-0 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar />
      </div>

      {/* Search header and the inbox list / reader workspace. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <Header />
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>

      {/* AI agent is a side panel on desktop and a full-screen workspace on phones. */}
      {isAgentPanelOpen && (
        <>
          <div className="hidden w-[360px] shrink-0 flex-col overflow-hidden border-l border-[#e7eaf0] bg-white lg:flex">
            <AgentSidebar />
          </div>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="AI assistant"
            className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white lg:hidden"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#e7eaf0] px-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[#202b3c]">AI assistant</h2>
                <p className="text-[11px] text-[#929bad]">Your inbox copilot</p>
              </div>
              <button
                type="button"
                onClick={toggleAgentPanel}
                aria-label="Close AI assistant"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-[#667085] transition-colors hover:bg-[#f2f4f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bb8fa]"
              >
                <XIcon size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <AgentSidebar />
            </div>
          </section>
        </>
      )}

      <ComposeEmail />
    </div>
  );
}
