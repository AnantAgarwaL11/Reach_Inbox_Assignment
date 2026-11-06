/**
 * Encryption tests
 *
 * AES-256-GCM: each test verifies a property of authenticated encryption.
 */

// Provide a 32-char key for the env validator
process.env.ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz123456';
process.env.SESSION_SECRET = 'test-session-secret-at-least-16c';
process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_CALLBACK_URL = 'http://localhost:3001/auth/google/callback';

import { encrypt, decrypt } from '../utils/encryption';

describe('encrypt / decrypt', () => {
  it('round-trips plaintext correctly', () => {
    const original = 'xoxb-slack-token-abc123';
    expect(decrypt(encrypt(original))).toBe(original);
  });

  it('produces different ciphertext on each call (random IV)', () => {
    const plaintext = 'same-input';
    const c1 = encrypt(plaintext);
    const c2 = encrypt(plaintext);
    expect(c1).not.toBe(c2);
  });

  it('ciphertext format is iv:tag:data', () => {
    const c = encrypt('hello');
    const parts = c.split(':');
    expect(parts).toHaveLength(3);
    // IV is 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24);
    // GCM tag is 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
    // Encrypted data must be non-empty
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it('throws when ciphertext is tampered with', () => {
    const c = encrypt('secret');
    // Flip one character in the data section
    const parts = c.split(':');
    parts[2] = parts[2].slice(0, -2) + 'ff';
    const tampered = parts.join(':');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('throws on malformed input', () => {
    expect(() => decrypt('not-valid-format')).toThrow('Invalid encrypted value format');
  });
});
