// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import EmailAttachmentList from "~/components/EmailAttachmentList";
import EmailIframe from "~/components/EmailIframe";
import { formatDetailDate, rewriteInlineImages } from "~/lib/utils";
import type { Email } from "~/types";

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
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-[#edf0f4] px-5 py-5 md:px-7">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e7eefb] text-sm font-semibold text-[#49658d]">
              {email.sender.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-[#273449]">
                {email.sender}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-[#929bad]">
                To: {email.recipient}
              </div>
            </div>
          </div>
          <span className="shrink-0 text-[11px] text-[#929bad]">
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
