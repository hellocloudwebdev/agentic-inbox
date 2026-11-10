// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export type SenderAvatarBrand = "zoho";

const BRAND_DOMAINS: Record<string, SenderAvatarBrand> = {
  "zohoaccounts.in": "zoho",
  "zoho.com": "zoho",
  "zoho.in": "zoho",
  "zoho.eu": "zoho",
  "zoho.com.cn": "zoho",
  "zohomail.com": "zoho",
  "zohomail.in": "zoho",
};

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

function getEmailDomain(email: string): string {
  const normalized = email.trim().toLowerCase();
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0 || separator === normalized.length - 1) return "";
  return normalized.slice(separator + 1);
}

/**
 * Returns a locally-rendered logo for known sender brands. This prevents
 * domains such as zohoaccounts.in from resolving to a generic globe favicon.
 */
export function getSenderAvatarBrand(email: string): SenderAvatarBrand | null {
  const domain = getEmailDomain(email);
  return BRAND_DOMAINS[domain] ?? null;
}

/**
 * Public image sources for sender emails. Personal mailbox domains deliberately
 * do not use domain favicons: a Gmail logo is not the sender's profile photo.
 */
export async function getSenderAvatarSources(
  email: string,
  size: number,
): Promise<string[]> {
  const domain = getEmailDomain(email);
  if (!domain || getSenderAvatarBrand(email)) return [];

  const normalized = email.trim().toLowerCase();
  const sources: string[] = [];

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

  if (!PERSONAL_EMAIL_DOMAINS.has(domain)) {
    sources.push(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
    );
  }

  return sources;
}
