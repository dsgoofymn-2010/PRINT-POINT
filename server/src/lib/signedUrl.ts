import crypto from 'node:crypto';
import { env } from '../config/env';
import { safeEqual } from './tokens';

/**
 * Short-lived file links: /api/v1/files/<id>?exp=<unix seconds>&sig=<hmac>.
 * The link itself is the permission, so it is only handed out after an access check
 * and stops working after SIGNED_URL_TTL_SECONDS.
 */
const key = () => crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update('file-links-v1').digest();

const sign = (fileId: string, exp: number, disposition: string) =>
  crypto.createHmac('sha256', key()).update(`${fileId}.${exp}.${disposition}`).digest('base64url');

export type Disposition = 'inline' | 'attachment';

export function signedFileUrl(fileId: string, disposition: Disposition = 'attachment', now = Date.now()) {
  const exp = Math.floor(now / 1000) + env.SIGNED_URL_TTL_SECONDS;
  const params = new URLSearchParams({ exp: String(exp), d: disposition, sig: sign(fileId, exp, disposition) });
  return { url: `/api/v1/files/${fileId}?${params}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function verifyFileSignature(fileId: string, exp: number, disposition: string, sig: string, now = Date.now()): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  return safeEqual(sign(fileId, exp, disposition), sig);
}
