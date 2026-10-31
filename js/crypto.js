/**
 * Browser decrypt for data/feed.enc.json.
 * Must stay compatible with scripts/sync.mjs:
 * PBKDF2-SHA256, 64-byte output, first 32 bytes AES-256-GCM,
 * ciphertext stored as raw ciphertext || 16-byte tag.
 * This file uses WebCrypto only so Node's test can import it.
 */

export const MIN_ITERATIONS = 250000;
const MAX_ITERATIONS = 2000000;
const SESSION_KEY = 'assistant-desk.aes';

export function b64ToBytes(b64) {
  const clean = String(b64).replace(/\s/g, '');
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function assertIterations(iterations) {
  return Number.isInteger(iterations) && iterations >= MIN_ITERATIONS && iterations <= MAX_ITERATIONS;
}

export async function deriveAesKey(passcode, saltBytes, iterations) {
  if (!assertIterations(iterations)) throw new Error('weak kdf');
  const subtle = globalThis.crypto.subtle;
  const material = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passcode),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = new Uint8Array(await subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new Uint8Array(saltBytes),
      iterations,
    },
    material,
    512,
  ));
  return subtle.importKey('raw', bits.slice(0, 32), { name: 'AES-GCM' }, true, ['decrypt']);
}

function readEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') throw new Error('bad feed');
  if (!assertIterations(envelope.iterations)) throw new Error('weak kdf');
  const salt = b64ToBytes(envelope.salt);
  const iv = b64ToBytes(envelope.iv);
  const data = b64ToBytes(envelope.ciphertext);
  if (salt.byteLength < 16 || salt.byteLength > 64) throw new Error('bad feed');
  if (iv.byteLength !== 12) throw new Error('bad feed');
  if (data.byteLength < 17) throw new Error('bad feed');
  return { salt, iv, data };
}

export async function decryptWithKey(key, envelope) {
  const { iv, data } = readEnvelope(envelope);
  let plain;
  try {
    plain = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  } catch {
    throw new Error('decrypt failed');
  }
  const text = new TextDecoder().decode(plain);
  const json = JSON.parse(text);
  if (!json || typeof json !== 'object' || !Array.isArray(json.bots)) throw new Error('bad feed');
  return json;
}

export async function decryptFeed(envelope, passcode) {
  if (typeof passcode !== 'string' || passcode.length === 0) throw new Error('decrypt failed');
  const { salt } = readEnvelope(envelope);
  const key = await deriveAesKey(passcode, salt, envelope.iterations);
  const data = await decryptWithKey(key, envelope);
  return { data, key };
}

export async function saveSession(key, envelope) {
  const raw = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', key));
  const payload = {
    k: bytesToB64(raw),
    salt: envelope.salt,
    iterations: envelope.iterations,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

export async function readSession(envelope) {
  let raw;
  try {
    raw = sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.salt !== envelope.salt || parsed.iterations !== envelope.iterations) return null;
    const bytes = b64ToBytes(parsed.k);
    if (bytes.byteLength !== 32) return null;
    return globalThis.crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, true, ['decrypt']);
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode */
  }
}
