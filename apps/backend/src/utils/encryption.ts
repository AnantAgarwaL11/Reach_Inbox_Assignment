import crypto from 'crypto';
import { env } from '../config/env';

// AES-256-GCM: authenticated encryption
// - 256-bit key → confidentiality
// - GCM tag → integrity (detects tampering)
// - Random 12-byte IV per encryption → same plaintext produces different ciphertext
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;  // 96 bits is the GCM recommended IV length
const TAG_LENGTH = 16; // 128-bit authentication tag

// Key must be exactly 32 bytes for AES-256
const KEY = Buffer.from(env.ENCRYPTION_KEY, 'utf8');

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  // Store as: iv(hex):tag(hex):ciphertext(hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, encryptedHex] = ciphertext.split(':');

  if (!ivHex || !tagHex || !encryptedHex) {
    throw new Error('Invalid encrypted value format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);

  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}
