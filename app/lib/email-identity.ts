// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface DisplayAddress {
  name: string;
  email: string;
}

export interface SelfIdentity {
  email?: string;
  name?: string;
}

type RawHeader = {
  key?: unknown;
  name?: unknown;
  value?: unknown;
};

function getHeaderValue(rawHeaders: string | null | undefined, headerName: string): string {
  if (!rawHeaders) return "";

  try {
    const parsed: unknown = JSON.parse(rawHeaders);
    if (Array.isArray(parsed)) {
      const match = (parsed as RawHeader[]).find((header) => {
        const key = typeof header.key === "string"
          ? header.key
          : typeof header.name === "string"
            ? header.name
            : "";
        return key.toLowerCase() === headerName.toLowerCase();
      });
      if (typeof match?.value === "string") return match.value;
    } else if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const value = record[headerName] ?? record[headerName.toLowerCase()];
      if (typeof value === "string") return value;
    }
  } catch {
    // Older or malformed stored headers should never prevent reading a message.
  }

  return "";
}

function splitAddressList(value: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  let angleDepth = 0;
  let escaped = false;

  for (const char of value) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && inQuotes) {
      current += char;
      escaped = true;
      continue;
    }
    if (char === '"') inQuotes = !inQuotes;
    if (!inQuotes && char === "<") angleDepth += 1;
    if (!inQuotes && char === ">") angleDepth = Math.max(0, angleDepth - 1);

    if (char === "," && !inQuotes && angleDepth === 0) {
      if (current.trim()) result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) result.push(current.trim());
  return result;
}

function cleanDisplayName(value: string): string {
  return value
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ");
}

function prettifyEmailLocalPart(email: string): string {
  const localPart = email.split("@")[0] || email;
  const words = localPart.replace(/[._+-]+/g, " ").trim();
  if (!words) return email;
  return words.replace(/\b[a-z]/gi, (letter) => letter.toUpperCase());
}

export function parseAddressList(value: string | null | undefined): DisplayAddress[] {
  if (!value?.trim()) return [];

  return splitAddressList(value)
    .map((item) => {
      const angleMatch = item.match(/^(.*?)\s*<([^<>]+)>\s*$/);
      if (angleMatch) {
        const email = angleMatch[2].trim();
        const name = cleanDisplayName(angleMatch[1]);
        return {
          name: name || prettifyEmailLocalPart(email),
          email,
        };
      }

      const emailMatch = item.match(/[A-Z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (emailMatch) {
        const email = emailMatch[0].trim();
        const name = cleanDisplayName(item.replace(emailMatch[0], "").replace(/[<>]/g, ""));
        return {
          name: name || prettifyEmailLocalPart(email),
          email,
        };
      }

      const text = cleanDisplayName(item);
      return text ? { name: text, email: "" } : null;
    })
    .filter((item): item is DisplayAddress => item !== null);
}

export function getSenderIdentity(
  sender: string,
  rawHeaders?: string | null,
  selfIdentity?: SelfIdentity,
): DisplayAddress {
  const fromHeader = getHeaderValue(rawHeaders, "from");
  const parsed = parseAddressList(fromHeader || sender)[0];

  if (parsed) {
    const isSelf =
      !!selfIdentity?.email &&
      parsed.email.toLowerCase() === selfIdentity.email.trim().toLowerCase();

    return {
      name: isSelf && selfIdentity.name?.trim()
        ? selfIdentity.name.trim()
        : parsed.name || prettifyEmailLocalPart(parsed.email || sender),
      email: parsed.email || sender,
    };
  }

  return {
    name: prettifyEmailLocalPart(sender),
    email: sender,
  };
}

export function getRecipientSummary(
  recipient: string,
  rawHeaders?: string | null,
  cc?: string | null,
  selfIdentity?: SelfIdentity,
): string[] {
  const toHeader = getHeaderValue(rawHeaders, "to");
  const ccHeader = getHeaderValue(rawHeaders, "cc");
  const toAddresses = parseAddressList(toHeader || recipient);
  const ccAddresses = parseAddressList(ccHeader || cc || "");

  const formatAddress = (address: DisplayAddress) => {
    const isSelf =
      !!selfIdentity?.email &&
      address.email.toLowerCase() === selfIdentity.email.trim().toLowerCase();
    return isSelf && selfIdentity.name?.trim()
      ? selfIdentity.name.trim()
      : address.name || address.email;
  };

  const lines: string[] = [];
  if (toAddresses.length > 0) {
    lines.push("To: " + toAddresses.map(formatAddress).join(", "));
  }
  if (ccAddresses.length > 0) {
    lines.push("Cc: " + ccAddresses.map(formatAddress).join(", "));
  }
  if (lines.length === 0 && recipient.trim()) lines.push("To: " + recipient);
  return lines;
}
