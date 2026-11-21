import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const keyLength = 64;
const scryptOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const dummyHash = `${'0'.repeat(32)}:${'0'.repeat(128)}`;

function derivePasswordKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, scryptOptions, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await derivePasswordKey(password, salt);
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  const [salt, digest] = (hash ?? dummyHash).split(':');
  if (!/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{128}$/.test(digest ?? '')) return false;
  const key = await derivePasswordKey(password, salt);
  return timingSafeEqual(key, Buffer.from(digest, 'hex')) && Boolean(hash);
}
