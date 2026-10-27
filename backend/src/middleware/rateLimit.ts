import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env';

/** Signed-in limits count per account so a shared Wi-Fi does not block everyone. */
const byUser = (req: Request) => (req.user ? `u:${req.user.id}` : `ip:${req.ip ?? 'unknown'}`);

const make = (windowMinutes: number, limit: number, message: string, perUser = false) =>
  rateLimit({
    windowMs: windowMinutes * 60_000,
    limit,
    ...(perUser ? { keyGenerator: byUser } : {}),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Razorpay webhooks are signature-checked and must never be throttled.
    skip: (req) => process.env.NODE_ENV === 'test' || req.originalUrl.startsWith('/api/v1/payments/webhook'),
    message: { error: { code: 'RATE_LIMITED', message } },
  });

export const loginLimiter = make(15, 20, 'Too many login attempts. Try again in a few minutes.');
export const otpLimiter = make(15, 5, 'Too many OTP requests. Try again later.');
export const uploadLimiter = make(10, 60, 'Too many uploads. Please slow down.');
export const paymentLimiter = make(10, 30, 'Too many payment requests. Please wait a moment.');
export const apiLimiter = make(1, 300, 'Too many requests.');
export const requestLimiter = make(10, env.REQUEST_RATE_LIMIT, 'Too many print requests. Please wait a few minutes.', true);
export const pickupLimiter = make(15, 20, 'Too many pickup code attempts. Wait 15 minutes and try again.', true);
