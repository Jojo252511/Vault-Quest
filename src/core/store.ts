/**
 * Light obfuscation for the progress data in data.json.
 *
 * This is NOT real security: the key ships with the plugin. It only stops casual
 * editing of XP or achievements in data.json. A checksum detects manual changes.
 *
 * Format: vq1.<nonce hex>.<base64 payload>.<checksum hex>
 */

const SECRET = "vault-quest::7f3a9c1e::keep-on-writing";
const PREFIX = "vq1";

function fnv1a(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function keystream(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) & 0xff;
  };
}

function xor(bytes: Uint8Array, nonce: string): Uint8Array {
  const next = keystream(fnv1a(SECRET + nonce));
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ next();
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function checksum(nonce: string, json: string): string {
  return fnv1a(SECRET + "|" + nonce + "|" + json).toString(16).padStart(8, "0");
}

function randomNonce(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
}

export function seal(value: unknown, nonce: string = randomNonce()): string {
  const json = JSON.stringify(value);
  const payload = toBase64(xor(new TextEncoder().encode(json), nonce));
  return [PREFIX, nonce, payload, checksum(nonce, json)].join(".");
}

export type UnsealResult<T> = { ok: true; value: T } | { ok: false; reason: "format" | "tampered" };

export function unseal<T>(sealed: string): UnsealResult<T> {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) return { ok: false, reason: "format" };
  const [, nonce, payload, sum] = parts;
  try {
    const json = new TextDecoder().decode(xor(fromBase64(payload), nonce));
    if (checksum(nonce, json) !== sum) return { ok: false, reason: "tampered" };
    return { ok: true, value: JSON.parse(json) as T };
  } catch {
    return { ok: false, reason: "tampered" };
  }
}
