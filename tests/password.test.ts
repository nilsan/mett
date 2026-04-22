import { describe, it, expect } from 'bun:test';
import { hashPassword, verifyPassword, isLegacyPlaintext } from '../src/services/password.js';

describe('hashPassword / verifyPassword', () => {
  it('accepts a correct password', () => {
    const h = hashPassword('PASSWORD');
    expect(verifyPassword('PASSWORD', h)).toBe(true);
  });

  it('rejects an incorrect password', () => {
    const h = hashPassword('PASSWORD');
    expect(verifyPassword('password', h)).toBe(false);
    expect(verifyPassword('PASSWOR', h)).toBe(false);
    expect(verifyPassword('PASSWORDX', h)).toBe(false);
  });

  it('produces distinct hashes for the same input (salt randomness)', () => {
    const a = hashPassword('same');
    const b = hashPassword('same');
    expect(a).not.toBe(b);
    expect(verifyPassword('same', a)).toBe(true);
    expect(verifyPassword('same', b)).toBe(true);
  });

  it('rejects empty input even against a valid hash', () => {
    const h = hashPassword('x');
    expect(verifyPassword('', h)).toBe(false);
  });

  it('rejects empty or missing stored value', () => {
    expect(verifyPassword('x', '')).toBe(false);
    expect(verifyPassword('x', null)).toBe(false);
    expect(verifyPassword('x', undefined)).toBe(false);
  });

  it('rejects malformed stored hash', () => {
    expect(verifyPassword('x', 'scrypt$only-one-part')).toBe(false);
    expect(verifyPassword('x', 'scrypt$$')).toBe(false);
    expect(verifyPassword('x', 'not-a-hash')).toBe(false);
  });

  it('hashes have the expected prefix', () => {
    expect(hashPassword('x').startsWith('scrypt$')).toBe(true);
  });
});

describe('isLegacyPlaintext', () => {
  it('returns true for non-hash strings', () => {
    expect(isLegacyPlaintext('PASSWORD')).toBe(true);
    expect(isLegacyPlaintext('hello')).toBe(true);
  });

  it('returns false for scrypt-prefixed hashes', () => {
    expect(isLegacyPlaintext(hashPassword('x'))).toBe(false);
  });

  it('returns false for empty / null / undefined', () => {
    expect(isLegacyPlaintext('')).toBe(false);
    expect(isLegacyPlaintext(null)).toBe(false);
    expect(isLegacyPlaintext(undefined)).toBe(false);
  });
});
