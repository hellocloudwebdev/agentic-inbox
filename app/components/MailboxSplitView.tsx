// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { ReactNode } from "react";
import ComposePanel from "~/components/ComposePanel";
import EmailPanel from "~/components/EmailPanel";

interface MailboxSplitViewProps {
  selectedEmailId: string | null;
  isComposing: boolean;
  children: ReactNode;
}

export default function MailboxSplitView({
  selectedEmailId,
  isComposing,
  children,
}: MailboxSplitViewProps) {
  const isPanelOpen = selectedEmailId !== null || isComposing;

  return (
    <div className="flex h-full min-w-0 bg-white">
      <div
        className={`flex min-w-0 shrink-0 flex-col bg-white ${
          isPanelOpen
            ? "hidden md:flex md:w-[42%] md:border-r md:border-[#e7eaf0] lg:w-[360px] xl:w-[390px]"
            : "w-full"
        }`}
      >
        {children}
      </div>

      {isPanelOpen && (
        <div className="flex min-w-0 w-full flex-1 flex-col overflow-hidden bg-white md:w-auto">
          {isComposing && !selectedEmailId ? (
            <ComposePanel />
          ) : isComposing && selectedEmailId ? (
            <div className="flex h-full flex-col overflow-y-auto">
              <ComposePanel />
              <div className="border-t border-[#e7eaf0]">
                <EmailPanel emailId={selectedEmailId} />
              </div>
            </div>
          ) : selectedEmailId ? (
            <EmailPanel emailId={selectedEmailId} />
          ) : null}
        </div>
      )}
    </div>
  );
}
