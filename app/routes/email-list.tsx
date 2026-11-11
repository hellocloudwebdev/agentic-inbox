// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Pagination, Tooltip } from "@cloudflare/kumo";
import {
  ArchiveIcon,
  ArrowBendUpLeftIcon,
  ArrowsClockwiseIcon,
  EnvelopeOpenIcon,
  EnvelopeSimpleIcon,
  DotsThreeVerticalIcon,
  FileIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  StarIcon,
  TrashIcon,
  TrayIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { Folders } from "shared/folders";
import { formatListDate } from "shared/dates";
import MailboxSplitView from "~/components/MailboxSplitView";
import SenderAvatar from "~/components/SenderAvatar";
import { getSnippetText } from "~/lib/utils";
import { getSenderIdentity } from "~/lib/email-identity";
import {
  useDeleteEmail,
  useEmails,
  useMarkThreadRead,
  useUpdateEmail,
} from "~/queries/emails";
import { useFolders } from "~/queries/folders";
import { useMailbox } from "~/queries/mailboxes";
import { queryKeys } from "~/queries/keys";
import { useUIStore } from "~/hooks/useUIStore";
import type { Email } from "~/types";

const PAGE_SIZE = 25;

const FOLDER_EMPTY_STATES: Record<
  string,
  {
    icon: React.ReactNode;
    title: string;
    description: string;
    showCompose?: boolean;
  }
> = {
  [Folders.INBOX]: {
    icon: <TrayIcon size={48} weight="thin" className="text-kumo-subtle" />,
    title: "Your inbox is empty",
    description:
      "New emails will appear here when they arrive. Send an email to get the conversation started.",
    showCompose: true,
  },
  [Folders.SENT]: {
    icon: (
      <PaperPlaneTiltIcon size={48} weight="thin" className="text-kumo-subtle" />
    ),
    title: "No sent emails",
    description: "Emails you send will show up here.",
    showCompose: true,
  },
  [Folders.DRAFT]: {
    icon: <FileIcon size={48} weight="thin" className="text-kumo-subtle" />,
    title: "No drafts",
    description: "Emails you're still working on will be saved here.",
    showCompose: true,
  },
  [Folders.ARCHIVE]: {
    icon: <ArchiveIcon size={48} weight="thin" className="text-kumo-subtle" />,
    title: "Archive is empty",
    description:
      "Move emails here to keep your inbox clean without deleting them.",
  },
  [Folders.TRASH]: {
    icon: <TrashIcon size={48} weight="thin" className="text-kumo-subtle" />,
    title: "Trash is empty",
    description:
      "Deleted emails will appear here. You can restore them or permanently delete them.",
  },
};

function EmailListSkeleton() {
  return (
    <div className="animate-pulse space-y-1 p-2">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-4">
          <div className="h-9 w-9 rounded-full bg-kumo-fill" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 rounded bg-kumo-fill" />
            <div className="h-3 w-full rounded bg-kumo-fill" />
            <div className="h-2.5 w-3/4 rounded bg-kumo-fill" />
          </div>
        </div>
      ))}
    </div>
  );
}

function FolderEmptyState({
  folder,
  onCompose,
}: {
  folder?: string;
  onCompose: () => void;
}) {
  const config = (folder && FOLDER_EMPTY_STATES[folder]) || {
    icon: (
      <EnvelopeSimpleIcon size={48} weight="thin" className="text-kumo-subtle" />
    ),
    title: "No emails",
    description: "This folder is empty.",
  };

  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="mb-4">{config.icon}</div>
      <h3 className="mb-1.5 text-base font-semibold text-kumo-default">
        {config.title}
      </h3>
      <p className="mb-5 max-w-xs text-sm text-kumo-subtle">
        {config.description}
      </p>
      {"showCompose" in config && config.showCompose && (
        <Button
          variant="primary"
          size="sm"
          icon={<PencilSimpleIcon size={16} />}
          onClick={onCompose}
        >
          Compose
        </Button>
      )}
    </div>
  );
}

export default function EmailListRoute() {
  const { mailboxId, folder } = useParams<{
    mailboxId: string;
    folder: string;
  }>();
  const {
    selectedEmailId,
    isComposing,
    selectEmail,
    closePanel,
    startCompose,
  } = useUIStore();
  const [page, setPage] = useState(1);
  const [mobileActionsEmailId, setMobileActionsEmailId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const updateEmail = useUpdateEmail();
  const markThreadRead = useMarkThreadRead();
  const deleteEmail = useDeleteEmail();

  const params = useMemo(
    () => ({
      folder: folder || "",
      page: String(page),
      limit: String(PAGE_SIZE),
    }),
    [folder, page],
  );

  const {
    data: emailData,
    isFetching: isRefreshing,
  } = useEmails(mailboxId, params, { refetchInterval: 30_000 });

  const emails = emailData?.emails ?? [];
  const totalCount = emailData?.totalCount ?? 0;
  const { data: folders = [] } = useFolders(mailboxId);
  const { data: mailbox } = useMailbox(mailboxId);
  const selfIdentity = {
    email: mailbox?.email || mailboxId || "",
    name:
      (typeof mailbox?.settings?.fromName === "string" &&
        mailbox.settings.fromName.trim()) ||
      mailbox?.name?.trim() ||
      "You",
  };

  const folderName = useMemo(() => {
    const found = folders.find((f) => f.id === folder);
    if (found) return found.name;
    return folder ? folder.charAt(0).toUpperCase() + folder.slice(1) : "Inbox";
  }, [folders, folder]);

  const isPanelOpen = selectedEmailId !== null || isComposing;
  const prevFolderRef = useRef<string | undefined>(undefined);
  const autoSelectedFolderRef = useRef<string | null>(null);

  useEffect(() => {
    const folderChanged = prevFolderRef.current !== `${mailboxId}/${folder}`;
    prevFolderRef.current = `${mailboxId}/${folder}`;

    if (folderChanged) {
      closePanel();
      setPage(1);
    }
  }, [mailboxId, folder, closePanel]);

  const toggleStar = (e: React.MouseEvent, email: Email) => {
    e.preventDefault();
    e.stopPropagation();
    if (mailboxId) {
      updateEmail.mutate({
        mailboxId,
        id: email.id,
        data: { starred: !email.starred },
      });
    }
  };

  const handleDelete = (e: React.MouseEvent, emailId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (mailboxId) {
      const confirmed = window.confirm(
        "Are you sure you want to delete this email?",
      );
      if (!confirmed) return;
      deleteEmail.mutate({ mailboxId, id: emailId });
      if (selectedEmailId === emailId) closePanel();
    }
  };

  const handleRefresh = () => {
    if (mailboxId) {
      queryClient.invalidateQueries({ queryKey: ["emails", mailboxId] });
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.list(mailboxId),
      });
    }
  };

  const hasUnread = (email: Email): boolean => {
    if (email.thread_unread_count !== undefined) {
      return email.thread_unread_count > 0;
    }
    return !email.read;
  };

  const handleRowClick = (email: Email) => {
    selectEmail(email.id);
    if (mailboxId && hasUnread(email)) {
      if (email.thread_id && email.thread_count && email.thread_count > 1) {
        markThreadRead.mutate({
          mailboxId,
          threadId: email.thread_id,
        });
      } else {
        updateEmail.mutate({
          mailboxId,
          id: email.id,
          data: { read: true },
        });
      }
    }
  };

  // On desktop, open the newest conversation in the reader by default.
  // Mobile keeps the full list visible until the user explicitly selects a row.
  useEffect(() => {
    const folderKey = `${mailboxId ?? ""}/${folder ?? ""}`;
    if (!emailData || autoSelectedFolderRef.current === folderKey) return;

    autoSelectedFolderRef.current = folderKey;
    if (
      !selectedEmailId &&
      !isComposing &&
      emails.length > 0 &&
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches
    ) {
      handleRowClick(emails[0]);
    }
  }, [
    emailData,
    emails,
    mailboxId,
    folder,
    selectedEmailId,
    isComposing,
    handleRowClick,
  ]);



  return (
    <MailboxSplitView
      selectedEmailId={selectedEmailId}
      isComposing={isComposing}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[#edf0f4] px-4 py-4 md:px-5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[#202b3c]">
            {folderName}
          </h2>
          <p className="mt-0.5 text-[11px] text-[#929bad]">
            {totalCount.toLocaleString()} conversation{totalCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="primary"
            size="sm"
            icon={<PencilSimpleIcon size={15} />}
            onClick={() => startCompose()}
            className="md:hidden"
          >
            Compose
          </Button>
          <Tooltip
            content={isRefreshing ? "Refreshing..." : "Refresh"}
            side="bottom"
            asChild
          >
            <Button
              variant="ghost"
              shape="square"
              size="sm"
              icon={
                <ArrowsClockwiseIcon
                  size={18}
                  className={isRefreshing ? "animate-spin" : ""}
                />
              }
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh"
            />
          </Tooltip>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isRefreshing && emails.length === 0 ? (
          <EmailListSkeleton />
        ) : emails.length > 0 ? (
          <div>
            {emails.map((email) => {
              const isSelected = selectedEmailId === email.id;
              const unread = hasUnread(email);
              const snippet = getSnippetText(email.snippet, 112);
              const sender = getSenderIdentity(email.sender, email.raw_headers, selfIdentity);
              const participant = sender.name;

              return (
                <div
                  key={email.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleRowClick(email)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRowClick(email);
                    }
                  }}
                  className={`group relative flex w-full cursor-pointer items-start gap-3 border-b border-[#edf0f4] border-l-[3px] px-3 py-3.5 text-left transition-colors sm:px-3.5 md:px-4 ${
                    isSelected
                      ? "border-l-[#596ce4] bg-[#f3f6ff]"
                      : "border-l-transparent hover:bg-[#fafbfe]"
                  }`}
                >
                  <SenderAvatar
                    email={sender.email || email.sender}
                    name={sender.name}
                    size={36}
                    className="mt-0.5"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={`min-w-0 flex-1 truncate text-[12px] ${
                          unread
                            ? "font-semibold text-[#263248]"
                            : "font-medium text-[#596579]"
                        }`}
                      >
                        {participant}
                      </span>
                      {(email.thread_count ?? 1) > 1 && (
                        <span className="shrink-0 rounded-full bg-[#edf0f5] px-1.5 py-0.5 text-[10px] font-medium text-[#737f92]">
                          {email.thread_count}
                        </span>
                      )}
                      {email.has_draft && (
                        <span className="shrink-0 text-[10px] font-semibold text-kumo-destructive">
                          Draft
                        </span>
                      )}
                      {email.needs_reply && !email.has_draft && (
                        <Tooltip content="Needs reply" asChild>
                          <span className="shrink-0 text-kumo-warning">
                            <ArrowBendUpLeftIcon size={13} weight="bold" />
                          </span>
                        </Tooltip>
                      )}
                      <span className="shrink-0 text-[10px] text-[#9aa3b2]">
                        {formatListDate(email.date)}
                      </span>
                    </div>
                    <div
                      className={`mt-1 truncate text-[12px] ${
                        unread
                          ? "font-semibold text-[#344054]"
                          : "font-medium text-[#596579]"
                      }`}
                    >
                      {email.subject || "(no subject)"}
                    </div>
                    {snippet && (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-[1.45] text-[#929bad]">
                        {snippet}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={email.starred ? "Unstar email" : "Star email"}
                      title={email.starred ? "Unstar" : "Star"}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border-0 bg-transparent text-[#a0a8b5] transition-colors hover:bg-white hover:text-[#d29a3c] sm:opacity-70 sm:group-hover:opacity-100"
                      onClick={(e) => toggleStar(e, email)}
                    >
                      <StarIcon
                        size={16}
                        weight={email.starred ? "fill" : "regular"}
                        className={email.starred ? "text-[#d29a3c]" : ""}
                      />
                    </button>
                    <div className="hidden items-center md:group-hover:flex">
                      <Tooltip content={email.read ? "Mark unread" : "Mark read"} asChild>
                        <Button
                          variant="ghost"
                          shape="square"
                          size="xs"
                          icon={
                            email.read ? (
                              <EnvelopeSimpleIcon size={14} />
                            ) : (
                              <EnvelopeOpenIcon size={14} />
                            )
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            if (mailboxId) {
                              updateEmail.mutate({
                                mailboxId,
                                id: email.id,
                                data: { read: !email.read },
                              });
                            }
                          }}
                          aria-label={email.read ? "Mark unread" : "Mark read"}
                        />
                      </Tooltip>
                      <Tooltip content="Delete" asChild>
                        <Button
                          variant="ghost"
                          shape="square"
                          size="xs"
                          icon={<TrashIcon size={14} />}
                          onClick={(e) => handleDelete(e, email.id)}
                          aria-label="Delete"
                        />
                      </Tooltip>
                    </div>
                    <div className="relative md:hidden">
                      <button
                        type="button"
                        aria-label="More email actions"
                        aria-haspopup="menu"
                        aria-expanded={mobileActionsEmailId === email.id}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-[#8792a4] transition-colors hover:bg-[#f1f4f8]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMobileActionsEmailId((current) =>
                            current === email.id ? null : email.id,
                          );
                        }}
                      >
                        <DotsThreeVerticalIcon size={19} />
                      </button>
                      {mobileActionsEmailId === email.id && (
                        <div
                          role="menu"
                          className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-[#e6e9ef] bg-white p-1 shadow-[0_12px_32px_rgba(24,35,56,0.16)]"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-[13px] text-[#344054] hover:bg-[#f5f7fa]"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (mailboxId) {
                                updateEmail.mutate({
                                  mailboxId,
                                  id: email.id,
                                  data: { read: !email.read },
                                });
                              }
                              setMobileActionsEmailId(null);
                            }}
                          >
                            {email.read ? "Mark as unread" : "Mark as read"}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-[13px] text-[#b42318] hover:bg-[#fef3f2]"
                            onClick={(e) => {
                              handleDelete(e, email.id);
                              setMobileActionsEmailId(null);
                            }}
                          >
                            Delete email
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <FolderEmptyState
            folder={folder}
            onCompose={() => startCompose()}
          />
        )}
      </div>

      {totalCount > PAGE_SIZE && (
        <div className="flex shrink-0 justify-center border-t border-[#edf0f4] py-3">
          <Pagination
            page={page}
            setPage={setPage}
            perPage={PAGE_SIZE}
            totalCount={totalCount}
          />
        </div>
      )}
    </MailboxSplitView>
  );
}
