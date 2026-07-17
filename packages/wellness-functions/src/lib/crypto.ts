const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("Malformed encrypted value.");
  }
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const secretHash = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(secret),
  );
  return crypto.subtle.importKey(
    "raw",
    secretHash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypts short OAuth secrets at rest with a key derived from the required JWT secret. */
export async function seal(value: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(secret),
    encoder.encode(value),
  );
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

export async function unseal(value: string, secret: string): Promise<string> {
  const [encodedIv, encodedCiphertext, extra] = value.split(".");
  if (
    encodedIv === undefined ||
    encodedCiphertext === undefined ||
    extra !== undefined
  ) {
    throw new Error("Malformed encrypted value.");
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: copyToArrayBuffer(fromBase64Url(encodedIv)) },
    await encryptionKey(secret),
    copyToArrayBuffer(fromBase64Url(encodedCiphertext)),
  );
  return decoder.decode(plaintext);
}

export function randomUrlSafe(bytesLength: number): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytesLength)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(verifier),
  );
  return toBase64Url(new Uint8Array(digest));
}
