// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import EmailAttachmentList from "~/components/EmailAttachmentList";
import EmailIframe from "~/components/EmailIframe";
import SenderAvatar from "~/components/SenderAvatar";
import { getRecipientSummary, getSenderIdentity } from "~/lib/email-identity";
import { formatDetailDate, rewriteInlineImages } from "~/lib/utils";
import type { Email } from "~/types";
import { useMailbox } from "~/queries/mailboxes";

interface SingleMessageViewProps {
  email: Email;
  mailboxId?: string;
  onPreviewImage: (url: string, filename: string) => void;
}

export default function SingleMessageView({
  email,
  mailboxId,
  onPreviewImage,
}: SingleMessageViewProps) {
  const { data: mailbox } = useMailbox(mailboxId);
  const selfIdentity = {
    email: mailbox?.email || mailboxId || "",
    name:
      (typeof mailbox?.settings?.fromName === "string" &&
        mailbox.settings.fromName.trim()) ||
      mailbox?.name?.trim() ||
      "You",
  };
  const sender = getSenderIdentity(email.sender, email.raw_headers, selfIdentity);
  const recipientSummary = getRecipientSummary(
    email.recipient,
    email.raw_headers,
    email.cc,
    selfIdentity,
  );

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-[#edf0f4] px-5 py-4 md:px-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <SenderAvatar
              email={sender.email || email.sender}
              name={sender.name}
              size={40}
              className="ring-1 ring-black/[0.03]"
            />
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="max-w-full truncate text-[13px] font-semibold leading-[1.35] text-[#273449]">
                  {sender.name}
                </span>
                <span className="min-w-0 truncate text-[11px] font-normal leading-[1.4] text-[#8993a4]">
                  {sender.email}
                </span>
              </div>
              {recipientSummary.length > 0 && (
                <div className="mt-1 truncate text-[11px] leading-[1.4] text-[#929bad]" title={recipientSummary.join("; ")}>
                  {recipientSummary.join("; ")}
                </div>
              )}
            </div>
          </div>
          <span className="shrink-0 pt-0.5 text-[11px] font-normal text-[#929bad]">
            {formatDetailDate(email.date)}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <EmailIframe
          body={rewriteInlineImages(
            email.body || "",
            mailboxId || "",
            email.id,
            email.attachments,
          )}
        />
      </div>

      <EmailAttachmentList
        mailboxId={mailboxId}
        emailId={email.id}
        attachments={email.attachments}
        onPreviewImage={onPreviewImage}
        className="shrink-0 border-t border-[#edf0f4] px-5 py-4 md:px-7"
        showHeading
      />
    </div>
  );
}
