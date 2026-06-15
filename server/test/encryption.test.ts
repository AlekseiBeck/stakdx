import { describe, it, expect, vi, afterEach } from 'vitest';
import { encrypt, decrypt } from '../src/encryption';

describe('encryption', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('round-trips a value back to the original plaintext', () => {
    const secret = 'PKABCDEF1234567890';
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it('round-trips unicode and empty strings', () => {
    expect(decrypt(encrypt(''))).toBe('');
    expect(decrypt(encrypt('café — 🔐 résumé'))).toBe('café — 🔐 résumé');
  });

  it('produces a fresh random IV each call (ciphertext differs for same input)', () => {
    const a = encrypt('same-input');
    const b = encrypt('same-input');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('same-input');
    expect(decrypt(b)).toBe('same-input');
  });

  it('emits the iv:tag:ciphertext shape', () => {
    const parts = encrypt('hello').split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/); // 12-byte IV
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/); // 16-byte GCM tag
  });

  it('rejects ciphertext whose auth tag has been tampered with', () => {
    const [iv, , ct] = encrypt('tamper-me').split(':');
    const forgedTag = 'f'.repeat(32);
    expect(() => decrypt(`${iv}:${forgedTag}:${ct}`)).toThrow();
  });

  it('rejects a malformed stored string', () => {
    expect(() => decrypt('not-valid')).toThrow('Invalid encrypted format');
  });

  it('throws when ENCRYPTION_KEY is not a 64-char hex string', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'too-short');
    expect(() => encrypt('x')).toThrow(/64-char hex/);
  });
});
