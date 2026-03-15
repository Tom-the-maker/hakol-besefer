import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

const SLUG_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function hashAccessToken(token) {
  return createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

export function safeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function generateSlug(length = 8) {
  let slug = '';

  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * SLUG_ALPHABET.length);
    slug += SLUG_ALPHABET[randomIndex];
  }

  return slug;
}

export function generateAccessToken() {
  return randomUUID();
}
