import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  APP_URL: z.string().url().default('http://localhost:5173'),
  // 'none' when the frontend is on a different domain (e.g. Vercel + Render). Needs HTTPS.
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  RAZORPAY_KEY_ID: z.string().default(''),
  RAZORPAY_KEY_SECRET: z.string().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(''),
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().default(25),
  FILE_RETENTION_HOURS: z.coerce.number().positive().default(24),
  ORPHAN_FILE_RETENTION_HOURS: z.coerce.number().positive().default(24),
  // File download links expire after this many seconds
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  // Max print requests one customer can send per 10 minutes
  REQUEST_RATE_LIMIT: z.coerce.number().int().min(1).max(1000).default(10),
  SMS_PROVIDER: z.enum(['console']).default('console'),
  DEV_OTP: z.string().regex(/^\d{6}$/).default('123456'),
  DEFAULT_COMMISSION_PERCENT: z.coerce.number().min(0).max(100).default(5),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
// The .env.example placeholders ("rzp_test_xxxx…") count as "not configured".
const realKey = (v: string) => Boolean(v) && !/x{6,}/i.test(v);
export const razorpayConfigured = realKey(env.RAZORPAY_KEY_ID) && realKey(env.RAZORPAY_KEY_SECRET);
