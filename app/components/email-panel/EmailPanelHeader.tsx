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
    <div className="shrink-0 border-b border-[#edf0f4] bg-white px-5 py-5 md:px-7">
      <h2 className="text-[19px] font-semibold leading-snug tracking-[-0.025em] text-[#202b3c]">
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
