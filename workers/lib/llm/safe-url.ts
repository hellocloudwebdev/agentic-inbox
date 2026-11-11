const PRIVATE_HOSTS = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export function assertSafeProviderUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Provider URL must be a valid HTTPS URL"); }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") {
    throw new Error("Provider URL must use public HTTPS without embedded credentials or custom ports");
  }
  if (PRIVATE_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local") ||
      host.endsWith(".internal") || host === "0.0.0.0" || host.includes(":") ||
      host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:") ||
      isPrivateIpv4(host)) {
    throw new Error("Private, local, and link-local provider hosts are not allowed");
  }
  return url;
}
