import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import type { AuthUser } from '../types/express';

interface AccessPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(user: AuthUser): string {
  const payload: AccessPayload = { sub: user.id, role: user.role };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'printpoint',
  });
}

export function verifyAccessToken(token: string): AuthUser {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'printpoint' });
  if (typeof decoded === 'string' || typeof decoded.sub !== 'string') throw new Error('Invalid token');
  return { id: decoded.sub, role: (decoded as jwt.JwtPayload & AccessPayload).role };
}

/** Refresh tokens are opaque random strings; only their HMAC is stored. */
export function newRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');
}

export function randomDigits(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += crypto.randomInt(0, 10).toString();
  return out;
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
