// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Tooltip } from "@cloudflare/kumo";
import {
  CaretDownIcon,
  CaretUpIcon,
  CodeIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import EmailAttachmentList from "~/components/EmailAttachmentList";
import EmailIframe from "~/components/EmailIframe";
import SenderAvatar from "~/components/SenderAvatar";
import {
  getRecipientSummary,
  getSenderIdentity,
} from "~/lib/email-identity";
import {
  formatDetailDate,
  formatShortDate,
  rewriteInlineImages,
  stripHtml,
} from "~/lib/utils";
import type { Email } from "~/types";

interface ThreadMessageProps {
  email: Email;
  mailboxId?: string;
  mailboxEmail?: string;
  isLast: boolean;
  isDraft?: boolean;
  isSending?: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSendDraft?: () => void;
  onEditDraft?: () => void;
  onDeleteDraft?: () => void;
  onViewSource?: () => void;
  onPreviewImage?: (url: string, filename: string) => void;
}

function Avatar({
  isDraft,
  email,
  name,
}: {
  isDraft?: boolean;
  email: string;
  name: string;
}) {
  if (isDraft) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-kumo-fill text-xs font-bold text-kumo-subtle">
        D
      </div>
    );
  }

  return <SenderAvatar email={email} name={name} size={32} />;
}

export default function ThreadMessage({
  email,
  mailboxId,
  mailboxEmail,
  isLast,
  isDraft,
  isSending,
  isExpanded,
  onToggleExpand,
  onSendDraft,
  onEditDraft,
  onDeleteDraft,
  onViewSource,
  onPreviewImage,
}: ThreadMessageProps) {
  const isSelf = email.sender.toLowerCase() === mailboxEmail?.toLowerCase();
  const sender = getSenderIdentity(email.sender, email.raw_headers);
  const senderLabel = isDraft ? "Draft reply" : isSelf ? "You" : sender.name;
  const recipientSummary = getRecipientSummary(
    email.recipient,
    email.raw_headers,
    email.cc,
  );
  const containerClassName = `${!isLast ? "border-b border-kumo-line" : ""} ${isDraft ? "border-l-2 border-l-kumo-warning bg-kumo-warning/[0.02]" : ""}`;

  if (!isExpanded) {
    return (
      <div className={containerClassName}>
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-kumo-tint"
        >
          <Avatar
            isDraft={isDraft}
            email={sender.email || email.sender}
            name={sender.name}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="truncate text-[13px] font-semibold text-kumo-default">
                  {senderLabel}
                </span>
                {!isDraft && (
                  <span className="truncate text-[11px] font-normal text-kumo-subtle">
                    {sender.email}
                  </span>
                )}
              </div>
              <span className="shrink-0 text-[11px] text-kumo-subtle">
                {formatDetailDate(email.date)}
              </span>
            </div>
            <p className="truncate text-xs text-kumo-subtle">
              {stripHtml(email.body || "").slice(0, 80)}
            </p>
          </div>
          <CaretDownIcon size={14} className="shrink-0 text-kumo-subtle" />
        </button>
      </div>
    );
  }

  return (
    <div className={`group/thread-msg ${containerClassName}`}>
      <div className="px-4 py-4 md:px-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={onToggleExpand}
              className="shrink-0"
              aria-label="Collapse message"
            >
              <div className="rounded-full transition-shadow hover:ring-2 hover:ring-kumo-brand/30">
                <Avatar
                  isDraft={isDraft}
                  email={sender.email || email.sender}
                  name={sender.name}
                />
              </div>
            </button>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="truncate text-[13px] font-semibold leading-[1.35] text-kumo-default">
                  {senderLabel}
                </span>
                {!isDraft && (
                  <span className="truncate text-[11px] font-normal leading-[1.4] text-kumo-subtle">
                    {sender.email}
                  </span>
                )}
                {isDraft && <Badge variant="outline">Draft</Badge>}
              </div>
              {recipientSummary.length > 0 && (
                <div
                  className="mt-1 truncate text-[11px] leading-[1.4] text-kumo-subtle"
                  title={recipientSummary.join("; ")}
                >
                  {recipientSummary.join("; ")}
                </div>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="text-[11px] text-kumo-subtle">
              {formatShortDate(email.date)}
            </span>
            {onViewSource && (
              <Tooltip content="View source" side="bottom" asChild>
                <Button
                  variant="ghost"
                  shape="square"
                  size="sm"
                  icon={<CodeIcon size={14} />}
                  onClick={onViewSource}
                  aria-label="View source"
                  className="!h-6 !w-6 transition-opacity"
                />
              </Tooltip>
            )}
            <button
              type="button"
              onClick={onToggleExpand}
              className="ml-1"
              aria-label="Collapse message"
            >
              <CaretUpIcon
                size={14}
                className="text-kumo-subtle transition-colors hover:text-kumo-default"
              />
            </button>
          </div>
        </div>

        <div className="md:ml-[42px]">
          <EmailIframe
            body={rewriteInlineImages(
              email.body || "",
              mailboxId || "",
              email.id,
              email.attachments,
            )}
            autoSize
          />
        </div>

        {isDraft && (onSendDraft || onEditDraft || onDeleteDraft) && (
          <div className="mt-3 flex gap-2 md:ml-[42px]">
            {onSendDraft && (
              <Button
                variant="primary"
                size="sm"
                icon={<PaperPlaneTiltIcon size={14} />}
                onClick={onSendDraft}
                loading={isSending}
                disabled={isSending}
              >
                {isSending ? "Sending..." : "Send"}
              </Button>
            )}
            {onEditDraft && (
              <Button
                variant="secondary"
                size="sm"
                icon={<PencilSimpleIcon size={14} />}
                onClick={onEditDraft}
                disabled={isSending}
              >
                Edit
              </Button>
            )}
            {onDeleteDraft && (
              <Button
                variant="ghost"
                size="sm"
                icon={<TrashIcon size={14} />}
                onClick={onDeleteDraft}
                disabled={isSending}
              >
                Discard
              </Button>
            )}
          </div>
        )}

        <EmailAttachmentList
          mailboxId={mailboxId}
          emailId={email.id}
          attachments={email.attachments}
          onPreviewImage={onPreviewImage}
          className="mt-3 md:ml-[42px]"
        />
      </div>
    </div>
  );
}
