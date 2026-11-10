// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useEffect, useState } from "react";

interface SenderAvatarProps {
  email: string;
  name: string;
  size?: number;
  className?: string;
}

const AVATAR_TONES = [
  "bg-[#fce8e6] text-[#a34a40]",
  "bg-[#e5efff] text-[#365e9d]",
  "bg-[#f6e8fa] text-[#80518f]",
  "bg-[#e5f4ed] text-[#39785b]",
  "bg-[#fff0d9] text-[#946528]",
];

// Consumer-mail domains have no public company profile logo. For those
// senders we use a real Gravatar when one exists, otherwise initials.
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.in",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "rediffmail.com",
]);

async function getAvatarSources(email: string, size: number): Promise<string[]> {
  const normalized = email.trim().toLowerCase();
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0 || separator === normalized.length - 1) return [];

  const domain = normalized.slice(separator + 1);
  const sources: string[] = [];

  // Gravatar uses SHA-256(email.trim().toLowerCase()) and only returns a
  // photo when the sender has published one for this address.
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(normalized);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    sources.push(
      `https://gravatar.com/avatar/${hash}?s=${Math.max(96, size * 3)}&d=404`,
    );
  }

  // For work/system mailers, also try the sender organization's public
  // favicon. This avoids showing initials for domains such as Zoho.
  if (!PERSONAL_EMAIL_DOMAINS.has(domain)) {
    sources.push(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
    );
  }

  return sources;
}

export default function SenderAvatar({
  email,
  name,
  size = 40,
  className = "",
}: SenderAvatarProps) {
  const [avatarState, setAvatarState] = useState<{
    email: string;
    sources: string[];
    index: number;
  }>({ email: "", sources: [], index: 0 });

  const toneIndex =
    Math.abs((email || name).charCodeAt(0) || 0) % AVATAR_TONES.length;
  const initial = (name.trim().charAt(0) || email.trim().charAt(0) || "?").toUpperCase();

  useEffect(() => {
    let cancelled = false;
    setAvatarState({ email, sources: [], index: 0 });

    getAvatarSources(email, size)
      .then((sources) => {
        if (!cancelled) setAvatarState({ email, sources, index: 0 });
      })
      .catch(() => {
        if (!cancelled) setAvatarState({ email, sources: [], index: 0 });
      });

    return () => {
      cancelled = true;
    };
  }, [email, size]);

  const currentState = avatarState.email === email ? avatarState : null;
  const activeSource = currentState?.sources[currentState.index] || null;

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${AVATAR_TONES[toneIndex]} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.34) }}
      role="img"
      aria-label={`Avatar for ${name || email || "sender"}`}
    >
      {!activeSource && <span aria-hidden="true">{initial}</span>}
      {activeSource && (
        <img
          key={activeSource}
          src={activeSource}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() =>
            setAvatarState((current) =>
              current.email === email
                ? { ...current, index: current.index + 1 }
                : current,
            )
          }
          className="absolute inset-0 h-full w-full rounded-full bg-white object-cover"
        />
      )}
    </div>
  );
}
