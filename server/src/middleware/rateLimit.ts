import rateLimit from 'express-rate-limit';

const make = (windowMinutes: number, limit: number, message: string) =>
  rateLimit({
    windowMs: windowMinutes * 60_000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    message: { error: { code: 'RATE_LIMITED', message } },
  });

export const loginLimiter = make(15, 20, 'Too many login attempts. Try again in a few minutes.');
export const otpLimiter = make(15, 5, 'Too many OTP requests. Try again later.');
export const uploadLimiter = make(10, 60, 'Too many uploads. Please slow down.');
export const paymentLimiter = make(10, 30, 'Too many payment requests. Please wait a moment.');
export const apiLimiter = make(1, 300, 'Too many requests.');
