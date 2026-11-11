// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

interface EmailPanelHeaderProps {
  subject: string;
  messageCount: number;
  showThreadCount: boolean;
}

export default function EmailPanelHeader({
  subject,
  messageCount,
  showThreadCount,
}: EmailPanelHeaderProps) {
  return (
    <div className="shrink-0 border-b border-[#edf0f4] bg-white px-4 py-4 sm:px-5 md:px-7 md:py-5">
      <h2 className="break-words text-[17px] font-semibold leading-snug tracking-[-0.025em] text-[#202b3c] sm:text-[19px]">
        {subject || "(no subject)"}
      </h2>
      {showThreadCount && (
        <span className="mt-1.5 block text-[11px] text-[#929bad]">
          {messageCount} messages in this conversation
        </span>
      )}
    </div>
  );
}
