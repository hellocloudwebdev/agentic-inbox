// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Dialog, Input, Tooltip } from "@cloudflare/kumo";
import {
  ArchiveIcon,
  FileIcon,
  FolderIcon,
  GearSixIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  PlusIcon,
  RobotIcon,
  TrashIcon,
  TrayIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router";
import { Folders, SYSTEM_FOLDER_IDS } from "shared/folders";
import { useCreateFolder, useFolders } from "~/queries/folders";
import { useMailbox } from "~/queries/mailboxes";
import { useUIStore } from "~/hooks/useUIStore";

const FOLDER_ICONS: Record<string, React.ReactNode> = {
  [Folders.INBOX]: <TrayIcon size={18} weight="regular" />,
  [Folders.SENT]: <PaperPlaneTiltIcon size={18} weight="regular" />,
  [Folders.DRAFT]: <FileIcon size={18} weight="regular" />,
  [Folders.ARCHIVE]: <ArchiveIcon size={18} weight="regular" />,
  [Folders.TRASH]: <TrashIcon size={18} weight="regular" />,
};

const SYSTEM_FOLDER_LINKS = [
  { id: Folders.INBOX, label: "Inbox" },
  { id: Folders.SENT, label: "Sent" },
  { id: Folders.DRAFT, label: "Drafts" },
  { id: Folders.ARCHIVE, label: "Archive" },
  { id: Folders.TRASH, label: "Trash" },
];

interface FolderLinkProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  unreadCount?: number;
  onClick?: () => void;
}

function FolderLink({
  to,
  icon,
  label,
  unreadCount,
  onClick,
}: FolderLinkProps) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors ${
          isActive
            ? "bg-[#e9edff] font-semibold text-[#4d5fd0]"
            : "text-[#596579] hover:bg-[#f0f3f8] hover:text-[#202b3c]"
        }`
      }
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {unreadCount != null && unreadCount > 0 && (
        <Badge variant="secondary">{unreadCount}</Badge>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const { mailboxId } = useParams<{ mailboxId: string }>();
  const navigate = useNavigate();
  const { data: folders = [] } = useFolders(mailboxId);
  const createFolderMutation = useCreateFolder();
  const { startCompose, closeSidebar, toggleAgentPanel, isAgentPanelOpen } =
    useUIStore();
  const { data: currentMailbox } = useMailbox(mailboxId);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const customFolders = useMemo(
    () =>
      folders.filter(
        (f) => !(SYSTEM_FOLDER_IDS as readonly string[]).includes(f.id),
      ),
    [folders],
  );

  const getUnreadCount = (folderId: string) => {
    const found = folders.find((f) => f.id === folderId);
    return found?.unreadCount || 0;
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFolderName.trim() && mailboxId) {
      createFolderMutation.mutate({ mailboxId, name: newFolderName.trim() });
      setNewFolderName("");
      setIsCreateFolderOpen(false);
    }
  };

  const displayName = useMemo(() => {
    if (!currentMailbox) return mailboxId?.split("@")[0] || "Mailbox";
    if (currentMailbox.settings?.fromName) return currentMailbox.settings.fromName;
    if (currentMailbox.name && currentMailbox.name !== currentMailbox.email) {
      return currentMailbox.name;
    }
    return currentMailbox.email.split("@")[0] || currentMailbox.name;
  }, [currentMailbox, mailboxId]);

  const handleNavClick = () => closeSidebar();

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-[#e7eaf0] bg-[#fbfcfe]">
      <div className="px-3 pb-3 pt-4">
        <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-[#e8ebf1] bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#dff2f1] text-sm font-semibold text-[#315e6a]">
            {displayName.trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-[#202b3c]">
              {displayName}
            </div>
            <div className="mt-0.5 truncate text-[10px] text-[#8993a4]">
              {currentMailbox?.email || mailboxId}
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 pb-4">
        <button
          type="button"
          onClick={() => startCompose()}
          className="group relative flex h-[46px] w-full items-center gap-2.5 overflow-hidden rounded-xl px-3.5 text-left text-[13px] font-semibold text-white shadow-[0_5px_14px_rgba(18,143,224,0.20)] transition-all hover:-translate-y-px hover:shadow-[0_8px_18px_rgba(18,143,224,0.26)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#72b5ed] focus-visible:ring-offset-2"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(8,145,229,0.98) 0%, rgba(8,145,229,0.93) 42%, rgba(8,145,229,0.48) 72%, rgba(8,145,229,0.12) 100%), url('/images/compose-landscape.jpg')",
            backgroundSize: "cover, cover",
            backgroundPosition: "center, 76% 52%",
          }}
        >
          <PencilSimpleIcon size={17} weight="bold" />
          <span className="relative">Compose email</span>
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2.5">
        <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9aa3b2]">
          Mail
        </div>
        <div className="space-y-1">
          {SYSTEM_FOLDER_LINKS.map((folder) => (
            <FolderLink
              key={folder.id}
              to={`/mailbox/${mailboxId}/emails/${folder.id}`}
              icon={FOLDER_ICONS[folder.id]}
              label={folder.label}
              unreadCount={getUnreadCount(folder.id)}
              onClick={handleNavClick}
            />
          ))}
        </div>

        <div className="pt-6">
          <div className="mb-2 flex items-center justify-between px-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9aa3b2]">
              Folders
            </span>
            <Tooltip content="New folder" asChild>
              <Button
                variant="ghost"
                shape="square"
                size="xs"
                icon={<PlusIcon size={15} />}
                onClick={() => setIsCreateFolderOpen(true)}
                aria-label="Create new folder"
              />
            </Tooltip>
          </div>
          {customFolders.length > 0 ? (
            <div className="space-y-1">
              {customFolders.map((folder) => (
                <FolderLink
                  key={folder.id}
                  to={`/mailbox/${mailboxId}/emails/${folder.id}`}
                  icon={<FolderIcon size={18} weight="regular" />}
                  label={folder.name}
                  unreadCount={folder.unreadCount}
                  onClick={handleNavClick}
                />
              ))}
            </div>
          ) : (
            <p className="px-3 py-1 text-xs text-[#9aa3b2]">Your folders will appear here</p>
          )}
        </div>
      </nav>

      <div className="space-y-1 border-t border-[#e7eaf0] p-2.5">
        <button
          type="button"
          onClick={toggleAgentPanel}
          aria-pressed={isAgentPanelOpen}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors ${
            isAgentPanelOpen
              ? "bg-[#e9edff] font-semibold text-[#4d5fd0]"
              : "text-[#596579] hover:bg-[#f0f3f8]"
          }`}
        >
          <RobotIcon size={18} />
          <span>AI assistant</span>
        </button>
        <NavLink
          to={`/mailbox/${mailboxId}/settings`}
          onClick={handleNavClick}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors ${
              isActive
                ? "bg-[#e9edff] font-semibold text-[#4d5fd0]"
                : "text-[#596579] hover:bg-[#f0f3f8]"
            }`
          }
        >
          <GearSixIcon size={18} />
          <span>Settings</span>
        </NavLink>
      </div>

      <Dialog.Root
        open={isCreateFolderOpen}
        onOpenChange={setIsCreateFolderOpen}
      >
        <Dialog size="sm" className="p-6">
          <Dialog.Title className="mb-4 text-base font-semibold">
            Create folder
          </Dialog.Title>
          <form onSubmit={handleCreateFolder} className="space-y-4">
            <Input
              label="Folder name"
              placeholder="e.g. Projects"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              required
            />
            <div className="flex justify-end gap-2">
              <Dialog.Close
                render={(props) => (
                  <Button {...props} variant="secondary">
                    Cancel
                  </Button>
                )}
              />
              <Button
                type="submit"
                variant="primary"
                disabled={!newFolderName.trim()}
              >
                Create
              </Button>
            </div>
          </form>
        </Dialog>
      </Dialog.Root>
    </aside>
  );
}
