import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// scrypt at N=16384 (2^14), r=8, p=1 — OWASP 2023 minimum. Takes ~20-60 ms on
// modern desktops, which is fine for a LAN tool where auth requests are rare.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;
const PREFIX = 'scrypt$';

/** Hash a plaintext password. Returns "scrypt$<salt-hex>$<hash-hex>". */
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LEN);
  const hash = scryptSync(plain, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `${PREFIX}${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Timing-safe verify. Returns false for empty / malformed / mismatched. */
export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!plain || !stored || !stored.startsWith(PREFIX)) return false;
  const parts = stored.slice(PREFIX.length).split('$');
  if (parts.length !== 2) return false;
  const salt = Buffer.from(parts[0]!, 'hex');
  const expected = Buffer.from(parts[1]!, 'hex');
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = scryptSync(plain, salt, expected.length, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** True when the given stored hash is in the legacy plaintext form (pre-hashing migration). */
export function isLegacyPlaintext(stored: string | null | undefined): boolean {
  return !!stored && !stored.startsWith(PREFIX);
}
