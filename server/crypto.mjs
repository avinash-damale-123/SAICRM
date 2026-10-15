import { randomBytes, randomInt, scrypt as callbackScrypt, timingSafeEqual, createHash, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(callbackScrypt);
export const token = () => randomBytes(32).toString('hex');
export const otp = () => String(randomInt(0, 1000000)).padStart(6, '0');
export const hash = value => createHash('sha256').update(value).digest('hex');
export const digest = (secret, value) => createHmac('sha256', secret).update(value).digest('hex');
export function equal(a, b) {
  const x = Buffer.from(a || ''), y = Buffer.from(b || '');
  return x.length === y.length && timingSafeEqual(x, y);
}
export function validPassword(value) { return typeof value === 'string' && value.length >= 12 && value.length <= 128; }
export async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const result = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return salt + ':' + result.toString('hex');
}
export async function passwordMatches(password, stored) {
  const [salt, expected] = stored.split(':');
  const result = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return equal(result.toString('hex'), expected);
}
