import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { User } from '@prisma/client';
import { env, isProd } from '../config/env';
import { ah, badRequest, conflict, unauthorized } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { hashToken, newRefreshToken, randomDigits, signAccessToken } from '../lib/tokens';
import { authenticate, currentUser } from '../middleware/auth';
import { loginLimiter, otpLimiter } from '../middleware/rateLimit';
import { sms } from '../services/notify';

export const authRouter = Router();

const REFRESH_COOKIE = 'pp_refresh';
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);
const mobileSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+91|91)(?=\d{10}$)/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'));
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(128);

const publicUser = (u: User) => ({ id: u.id, name: u.name, email: u.email, mobile: u.mobile, role: u.role });

async function issueSession(req: Request, res: Response, user: User) {
  const token = newRefreshToken();
  const days = env.REFRESH_TOKEN_TTL_DAYS;
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + days * 86_400_000),
      userAgent: req.headers['user-agent']?.slice(0, 200),
    },
  });
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
    path: '/api/v1/auth',
    maxAge: days * 86_400_000,
  });
  return { accessToken: signAccessToken({ id: user.id, role: user.role }), user: publicUser(user) };
}

const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email().optional(),
    mobile: mobileSchema.optional(),
    password: passwordSchema,
    role: z.enum(['CUSTOMER', 'SHOP_OWNER']).default('CUSTOMER'),
  })
  .refine((v) => v.email || v.mobile, { message: 'Email or mobile number is required' });

authRouter.post(
  '/register',
  loginLimiter,
  ah(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const existing = await prisma.user.findFirst({
      where: { OR: [body.email ? { email: body.email } : {}, body.mobile ? { mobile: body.mobile } : {}].filter((c) => Object.keys(c).length) },
    });
    if (existing) throw conflict('An account with this email or mobile already exists');
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        mobile: body.mobile,
        role: body.role,
        passwordHash: await bcrypt.hash(body.password, 12),
      },
    });
    res.status(201).json(await issueSession(req, res, user));
  }),
);

const loginSchema = z.object({ identifier: z.string().trim().min(3).max(120), password: z.string().min(1).max(128) });

authRouter.post(
  '/login',
  loginLimiter,
  ah(async (req, res) => {
    const { identifier, password } = loginSchema.parse(req.body);
    const asMobile = mobileSchema.safeParse(identifier);
    const user = await prisma.user.findFirst({
      where: asMobile.success ? { mobile: asMobile.data } : { email: identifier.toLowerCase() },
    });
    // Compare against a dummy hash when the user is missing to keep timing similar.
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || !user.passwordHash) throw unauthorized('Incorrect login details');
    if (!user.isActive || user.deletedAt) throw unauthorized('This account is disabled. Contact support.');
    res.json(await issueSession(req, res, user));
  }),
);

authRouter.post(
  '/otp/request',
  otpLimiter,
  ah(async (req, res) => {
    const { mobile } = z.object({ mobile: mobileSchema }).parse(req.body);
    const code = isProd ? randomDigits(6) : env.DEV_OTP;
    await prisma.otpCode.create({
      data: { mobile, codeHash: hashToken(code), expiresAt: new Date(Date.now() + 5 * 60_000) },
    });
    await sms.send(mobile, `Your PrintPoint OTP is ${code}. Valid for 5 minutes.`);
    res.json({ sent: true, ...(isProd ? {} : { devHint: `Development OTP is ${env.DEV_OTP}` }) });
  }),
);

authRouter.post(
  '/otp/verify',
  otpLimiter,
  ah(async (req, res) => {
    const body = z
      .object({ mobile: mobileSchema, otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit OTP'), name: z.string().trim().min(2).max(80).optional() })
      .parse(req.body);
    const otp = await prisma.otpCode.findFirst({
      where: { mobile: body.mobile, consumed: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.attempts >= 5) throw unauthorized('OTP expired. Request a new one.');
    if (otp.codeHash !== hashToken(body.otp)) {
      await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw unauthorized('Incorrect OTP');
    }
    await prisma.otpCode.update({ where: { id: otp.id }, data: { consumed: true } });

    let user = await prisma.user.findUnique({ where: { mobile: body.mobile } });
    if (!user) {
      if (!body.name) throw badRequest('Enter your name to create an account', { needsName: true });
      user = await prisma.user.create({ data: { name: body.name, mobile: body.mobile, role: 'CUSTOMER' } });
    }
    if (!user.isActive || user.deletedAt) throw unauthorized('This account is disabled. Contact support.');
    res.json(await issueSession(req, res, user));
  }),
);

authRouter.post(
  '/refresh',
  ah(async (req, res) => {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof token !== 'string' || !token) throw unauthorized('No session');
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!stored || stored.expiresAt < new Date()) throw unauthorized('Session expired');
    if (stored.revokedAt) {
      // Reuse of a rotated token suggests theft: revoke every session for this user.
      await prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw unauthorized('Session expired');
    }
    if (!stored.user.isActive || stored.user.deletedAt) throw unauthorized('Account disabled');
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    res.json(await issueSession(req, res, stored.user));
  }),
);

authRouter.post(
  '/logout',
  ah(async (req, res) => {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof token === 'string' && token) {
      await prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(token) }, data: { revokedAt: new Date() } });
    }
    res.clearCookie(REFRESH_COOKIE, {
      path: '/api/v1/auth',
      secure: isProd || env.COOKIE_SAMESITE === 'none',
      sameSite: env.COOKIE_SAMESITE,
    });
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  authenticate,
  ah(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: currentUser(req).id } });
    if (!user) throw unauthorized();
    res.json({ user: publicUser(user) });
  }),
);
