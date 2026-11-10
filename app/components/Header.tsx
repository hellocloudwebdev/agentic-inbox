// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, Tooltip } from "@cloudflare/kumo";
import {
  GearSixIcon,
  ListIcon,
  MagnifyingGlassIcon,
  RobotIcon,
  XIcon,
} from "@phosphor-icons/react";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { useUIStore } from "~/hooks/useUIStore";
import { useFolders } from "~/queries/folders";
import { useMailbox } from "~/queries/mailboxes";

export default function Header() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const { mailboxId } = useParams<{ mailboxId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toggleSidebar, toggleAgentPanel, isAgentPanelOpen } = useUIStore();
  const { data: mailbox } = useMailbox(mailboxId);
  const { data: folders = [] } = useFolders(mailboxId);

  const displayName = useMemo(() => {
    if (mailbox?.settings?.fromName) return mailbox.settings.fromName;
    if (mailbox?.name && mailbox.name !== mailbox.email) return mailbox.name;
    return mailbox?.email?.split("@")[0] || mailboxId?.split("@")[0] || "there";
  }, [mailbox, mailboxId]);

  const unreadCount = folders.reduce(
    (total, folder) => total + (folder.unreadCount || 0),
    0,
  );

  const urlQuery = searchParams.get("q") || "";
  useEffect(() => {
    if (location.pathname.includes("/search") && urlQuery) {
      setSearchQuery(urlQuery);
    }
  }, [urlQuery, location.pathname]);

  const performSearch = () => {
    if (mailboxId && searchQuery.trim()) {
      const q = searchQuery.trim();
      navigate(`/mailbox/${mailboxId}/search?q=${encodeURIComponent(q)}`);
      setIsSearchExpanded(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    if (location.pathname.includes("/search") && mailboxId) {
      navigate(`/mailbox/${mailboxId}/emails/inbox`);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") performSearch();
    if (e.key === "Escape") {
      if (searchQuery) clearSearch();
      else setIsSearchExpanded(false);
    }
  };

  const isSettingsActive = location.pathname.includes("/settings");

  return (
    <header className="relative z-10 flex min-h-[68px] shrink-0 items-center gap-3 border-b border-[#e7eaf0] bg-white px-3 py-2.5 md:px-5 md:gap-5">
      <Button
        variant="ghost"
        shape="square"
        size="sm"
        icon={<ListIcon size={20} />}
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
        className="md:hidden shrink-0"
      />

      <div className="hidden min-w-[180px] shrink-0 sm:block">
        <h1 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[#202b3c]">
          Welcome back, {displayName}
        </h1>
        <p className="mt-0.5 text-[11px] text-[#8a94a6]">
          {unreadCount > 0
            ? `${unreadCount.toLocaleString()} unread messages`
            : "You're all caught up"}
        </p>
      </div>

      <div
        className={`mx-auto flex min-w-0 flex-1 items-center gap-2 transition-all sm:max-w-[620px] ${
          isSearchExpanded ? "flex" : "hidden md:flex"
        }`}
      >
        <div className="relative flex min-w-0 flex-1 items-center">
          <MagnifyingGlassIcon
            size={17}
            className="pointer-events-none absolute left-3 text-[#9aa3b2]"
          />
          <Input
            className="w-full"
            aria-label="Search emails"
            placeholder="Search anything..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#8993a4] transition-colors hover:bg-[#f0f3f8] hover:text-[#344054]"
              aria-label="Clear search"
            >
              <XIcon size={14} />
            </button>
          )}
        </div>
        <Tooltip content="Search" side="bottom" asChild>
          <Button
            variant="primary"
            shape="square"
            icon={<MagnifyingGlassIcon size={18} />}
            onClick={performSearch}
            aria-label="Search"
            className="shrink-0 rounded-lg"
          />
        </Tooltip>
      </div>

      {!isSearchExpanded && (
        <Button
          variant="ghost"
          shape="square"
          size="sm"
          icon={<MagnifyingGlassIcon size={20} />}
          onClick={() => setIsSearchExpanded(true)}
          aria-label="Search"
          className="md:hidden shrink-0"
        />
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Tooltip
          content={isAgentPanelOpen ? "Hide AI assistant" : "Show AI assistant"}
          side="bottom"
          asChild
        >
          <Button
            variant={isAgentPanelOpen ? "secondary" : "ghost"}
            shape="square"
            icon={<RobotIcon size={19} />}
            onClick={toggleAgentPanel}
            aria-label="Toggle AI assistant"
            className="hidden rounded-lg lg:inline-flex"
          />
        </Tooltip>
        <Tooltip content="Settings" side="bottom" asChild>
          <Button
            variant={isSettingsActive ? "secondary" : "ghost"}
            shape="square"
            icon={<GearSixIcon size={19} />}
            onClick={() =>
              navigate(
                isSettingsActive
                  ? `/mailbox/${mailboxId}/emails/inbox`
                  : `/mailbox/${mailboxId}/settings`,
              )
            }
            aria-label="Settings"
            className="rounded-lg"
          />
        </Tooltip>
      </div>
    </header>
  );
}
