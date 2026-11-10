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

async function getGravatarUrl(email: string, size: number): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@") || !globalThis.crypto?.subtle) {
    return null;
  }

  const bytes = new TextEncoder().encode(normalized);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `https://0.gravatar.com/avatar/${hash}?s=${Math.max(48, size * 2)}&d=404`;
}

export default function SenderAvatar({
  email,
  name,
  size = 40,
  className = "",
}: SenderAvatarProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const toneIndex =
    Math.abs((email || name).charCodeAt(0) || 0) % AVATAR_TONES.length;

  useEffect(() => {
    let cancelled = false;
    setAvatarUrl(null);
    setImageFailed(false);

    getGravatarUrl(email, size)
      .then((url) => {
        if (!cancelled) setAvatarUrl(url);
      })
      .catch(() => {
        if (!cancelled) setAvatarUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [email, size]);

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${AVATAR_TONES[toneIndex]} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.34) }}
      role="img"
      aria-label={`${name || "Sender"} profile image`}
    >
      {(!avatarUrl || imageFailed) && (
        <span aria-hidden="true">
          {(name.trim().charAt(0) || email.trim().charAt(0) || "?").toUpperCase()}
        </span>
      )}
      {avatarUrl && !imageFailed && (
        <img
          src={avatarUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="absolute inset-0 h-full w-full rounded-full object-cover"
        />
      )}
    </div>
  );
}
