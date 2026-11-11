function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}
async function getKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error("LLM_ENCRYPTION_KEY is not configured");
  const raw = decodeBase64(secret);
  if (raw.byteLength !== 32) throw new Error("LLM_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptApiKey(secret: string, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getKey(secret), new TextEncoder().encode(plaintext));
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv); combined.set(new Uint8Array(encrypted), iv.length);
  return encodeBase64(combined);
}
export async function decryptApiKey(secret: string, ciphertext: string): Promise<string> {
  const combined = decodeBase64(ciphertext);
  if (combined.length < 29) throw new Error("Encrypted provider key is invalid");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: combined.slice(0, 12) },
    await getKey(secret),
    combined.slice(12),
  );
  return new TextDecoder().decode(plaintext);
}
