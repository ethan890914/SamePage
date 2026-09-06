const encoder = new TextEncoder();
const PBKDF2_ITERATIONS = 150_000;

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function derivePassword(
  password: string,
  pepper: string,
  salt: Uint8Array,
) {
  const saltBuffer = new Uint8Array(salt).buffer;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`${password}\u0000${pepper}`),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function createPasswordVerifier(password: string, pepper: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, pepper, salt);
  return { salt: toBase64(salt), hash: toBase64(hash) };
}

export async function verifyPassword(
  password: string,
  pepper: string,
  salt: string,
  expectedHash: string,
) {
  const actual = await derivePassword(password, pepper, fromBase64(salt));
  return constantTimeEqual(actual, fromBase64(expectedHash));
}

export async function hashSessionToken(token: string, pepper: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`${token}\u0000${pepper}`),
  );
  return toBase64(new Uint8Array(digest));
}
