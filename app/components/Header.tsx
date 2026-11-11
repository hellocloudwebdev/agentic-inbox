// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Tooltip } from "@cloudflare/kumo";
import {
  CaretDownIcon,
  CheckIcon,
  EnvelopeSimpleIcon,
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
import { useMailbox, useMailboxes } from "~/queries/mailboxes";

export default function Header() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isMailboxMenuOpen, setIsMailboxMenuOpen] = useState(false);
  const { mailboxId } = useParams<{ mailboxId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const {
    toggleSidebar,
    toggleAgentPanel,
    isAgentPanelOpen,
  } = useUIStore();
  const { data: mailbox } = useMailbox(mailboxId);
  const { data: mailboxes = [] } = useMailboxes();
  const { data: folders = [] } = useFolders(mailboxId);

  const displayName = useMemo(() => {
    if (mailbox?.settings?.fromName) return mailbox.settings.fromName;
    if (mailbox?.name && mailbox.name !== mailbox.email) return mailbox.name;
    return mailbox?.email?.split("@")[0] || mailboxId?.split("@")[0] || "there";
  }, [mailbox, mailboxId]);

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

  useEffect(() => {
    setIsMailboxMenuOpen(false);
  }, [location.pathname]);

  const switchMailbox = (accountId: string) => {
    setIsMailboxMenuOpen(false);
    navigate(`/mailbox/${accountId}/emails/inbox`);
  };

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
    <header className="relative z-20 flex min-h-[60px] shrink-0 items-center gap-2 border-b border-[#e7eaf0] bg-white px-2.5 py-2 md:min-h-[68px] md:gap-5 md:px-5 md:py-2.5">
      {/* Mobile account switcher: the desktop app rail is replaced by this control. */}
      <div
        className="relative z-50 shrink-0 md:hidden"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
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
          className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#151923] text-white shadow-sm transition-colors hover:bg-[#252c3b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8da0ff]"
        >
          <EnvelopeSimpleIcon size={19} weight="fill" />
          <CaretDownIcon
            size={9}
            weight="bold"
            className="absolute bottom-[6px] right-[5px] opacity-80"
          />
        </button>

        {isMailboxMenuOpen && (
          <div
            role="menu"
            aria-label="Switch mailbox"
            className="absolute left-0 top-12 z-[80] w-[min(290px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-[#e6e9ef] bg-white p-2 shadow-[0_18px_55px_rgba(24,35,56,0.18)]"
          >
            <div className="px-3 pb-2 pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#929bad]">
                Switch mailbox
              </p>
              <p className="mt-1 text-[12px] text-[#596579]">
                Choose an email account
              </p>
            </div>
            <div className="max-h-[min(360px,65dvh)] space-y-1 overflow-y-auto">
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
                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
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
                className="min-h-10 w-full rounded-lg px-2 py-2 text-left text-[12px] font-medium text-[#657187] transition-colors hover:bg-[#f5f7fa] hover:text-[#263248]"
              >
                Manage mailboxes
              </button>
            </div>
          </div>
        )}
      </div>

      <Button
        variant="ghost"
        shape="square"
        size="sm"
        icon={<ListIcon size={20} />}
        onClick={toggleSidebar}
        aria-label="Open folders"
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border-0 bg-[#0865f7] text-white shadow-[0_2px_5px_rgba(8,101,247,0.18)] transition-colors hover:bg-[#0758dd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bb8fa] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!searchQuery.trim()}
          >
            <MagnifyingGlassIcon size={18} weight="regular" />
          </button>
        </Tooltip>

        {isSearchExpanded && (
          <button
            type="button"
            aria-label="Close search"
            onClick={() => setIsSearchExpanded(false)}
            className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-[#7b8798] hover:bg-[#f1f4f8] md:hidden"
          >
            <XIcon size={18} />
          </button>
        )}
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

      {!isSearchExpanded && (
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
              className="rounded-lg"
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
      )}
    </header>
  );
}
