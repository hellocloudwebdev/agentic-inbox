const encoder = new TextEncoder();
const decoder = new TextDecoder();
function decodeKey(value: string): Uint8Array {
  const raw = value.trim();
  if (/^[0-9a-f]{64}$/i.test(raw)) return Uint8Array.from(raw.match(/.{2}/g)!, x => parseInt(x, 16));
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function getKey(secret: string): Promise<CryptoKey> {
  const bytes = decodeKey(secret);
  if (![16, 24, 32].includes(bytes.length)) throw new Error("LLM_ENCRYPTION_KEY must be a 128, 192, or 256-bit base64/hex key");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptApiKey(value: string, secret: string): Promise<string> {
  if (!value.trim()) throw new Error("API key is required");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getKey(secret), encoder.encode(value));
  const bytes = new Uint8Array(iv.length + cipher.byteLength); bytes.set(iv); bytes.set(new Uint8Array(cipher), iv.length);
  return btoa(String.fromCharCode(...bytes));
}
export async function decryptApiKey(value: string, secret: string): Promise<string> {
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (bytes.length < 29) throw new Error("Invalid encrypted API key");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await getKey(secret), bytes.slice(12));
  return decoder.decode(plain);
}
