// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Tooltip } from "@cloudflare/kumo";
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
    if (location.pathname.includes("/search")) {
      setSearchQuery(urlQuery);
    }
  }, [urlQuery, location.pathname]);

  const performSearch = () => {
    const query = searchQuery.trim();
    if (!mailboxId || !query) return;
    navigate(`/mailbox/${mailboxId}/search?q=${encodeURIComponent(query)}`);
    setIsSearchExpanded(false);
  };

  const clearSearch = () => {
    setSearchQuery("");
    if (location.pathname.includes("/search") && mailboxId) {
      navigate(`/mailbox/${mailboxId}/emails/inbox`);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      performSearch();
    }
    if (event.key === "Escape") {
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
        className={`mx-auto flex min-w-0 flex-1 items-center gap-2 sm:max-w-[620px] ${
          isSearchExpanded ? "flex" : "hidden md:flex"
        }`}
      >
        <div className="relative min-w-0 flex-1">
          <MagnifyingGlassIcon
            size={17}
            weight="regular"
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8993a4]"
          />
          <input
            type="text"
            aria-label="Search emails"
            placeholder="Search anything..."
            autoComplete="off"
            spellCheck={false}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            className="block h-10 w-full min-w-0 rounded-[11px] border border-[#e1e5ec] bg-white pl-10 pr-10 text-[13px] font-normal leading-none text-[#344054] outline-none transition-[border-color,box-shadow] placeholder:text-[#929bad] hover:border-[#cfd6e1] focus:border-[#75a0fb] focus:ring-[3px] focus:ring-[#e9f0ff]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#929bad] transition-colors hover:bg-[#f1f4f8] hover:text-[#344054] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bb8fa]"
              aria-label="Clear search"
            >
              <XIcon size={14} />
            </button>
          )}
        </div>

        <Tooltip content="Search" side="bottom" asChild>
          <button
            type="button"
            onClick={performSearch}
            aria-label="Search"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border-0 bg-[#0865f7] text-white shadow-[0_2px_5px_rgba(8,101,247,0.18)] transition-colors hover:bg-[#0758dd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bb8fa] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!searchQuery.trim()}
          >
            <MagnifyingGlassIcon size={18} weight="regular" />
          </button>
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
