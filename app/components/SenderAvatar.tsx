// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useEffect, useState } from "react";
import {
  getSenderAvatarBrand,
  getSenderAvatarSources,
} from "~/lib/avatar-sources";

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

function ZohoBrandMark() {
  return (
    <svg
      viewBox="0 0 128 76"
      width="100%"
      height="100%"
      aria-hidden="true"
      className="p-[5px]"
    >
      <g fill="none" strokeWidth="6.5" strokeLinejoin="round">
        <rect
          x="5"
          y="22"
          width="39"
          height="39"
          rx="7"
          stroke="#E42527"
          transform="rotate(-9 24.5 41.5)"
        />
        <rect
          x="34"
          y="8"
          width="39"
          height="39"
          rx="7"
          stroke="#049949"
          transform="rotate(19 53.5 27.5)"
        />
        <rect
          x="62"
          y="19"
          width="39"
          height="39"
          rx="7"
          stroke="#236DB4"
          transform="rotate(-8 81.5 38.5)"
        />
        <rect
          x="88"
          y="22"
          width="35"
          height="37"
          rx="7"
          stroke="#F9B21D"
        />
      </g>
    </svg>
  );
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

  const brand = getSenderAvatarBrand(email);
  const toneIndex =
    Math.abs((email || name).charCodeAt(0) || 0) % AVATAR_TONES.length;
  const initial = (
    name.trim().charAt(0) ||
    email.trim().charAt(0) ||
    "?"
  ).toUpperCase();

  useEffect(() => {
    let cancelled = false;
    setAvatarState({ email, sources: [], index: 0 });

    getSenderAvatarSources(email, size)
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
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${
        brand === "zoho"
          ? "border border-[#edf0f4] bg-white"
          : AVATAR_TONES[toneIndex]
      } ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.34) }}
      role="img"
      aria-label={`${name || "Sender"} profile image`}
    >
      {brand === "zoho" && <ZohoBrandMark />}
      {!brand && !activeSource && (
        <span aria-hidden="true">{initial}</span>
      )}
      {!brand && activeSource && (
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
