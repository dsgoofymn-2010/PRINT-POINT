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
<<<<<<< HEAD
  STORAGE_DRIVER: z.enum(['local']).default('local'),
=======
  // 'supabase' keeps uploads in a private Supabase Storage bucket (survives Render redeploys).
  STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
  SUPABASE_URL: z.string().url().optional(),
  // Server-only secret (Project Settings -> API -> service_role). Never put it in the frontend.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  SUPABASE_BUCKET: z.string().regex(/^[a-z0-9._-]+$/).default('uploads'),
>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7
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
  // Demo site: nobody signs in; visitors switch between customer, shop owner and admin with one click.
  // On by default (this is a sample site). Set to false to require real sign-in.
<<<<<<< HEAD
  DEV_SKIP_LOGIN: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
=======
  DEV_SKIP_LOGIN: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  // Production refuses to start in demo mode unless this is also true (anyone could act as admin).
  ALLOW_DEMO_IN_PROD: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7
  // Which shop this app serves (its slug). Empty = the oldest approved shop.
  SHOP_SLUG: z.string().trim().default(''),
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
<<<<<<< HEAD
=======
if (env.STORAGE_DRIVER === 'supabase' && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
  console.error('STORAGE_DRIVER=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
if (isProd && env.DEV_SKIP_LOGIN && !env.ALLOW_DEMO_IN_PROD) {
  console.error(
    'Refusing to start: DEV_SKIP_LOGIN=true in production lets anyone sign in as admin. ' +
      'Set DEV_SKIP_LOGIN=false, or also set ALLOW_DEMO_IN_PROD=true for a throwaway demo site.',
  );
  process.exit(1);
}
>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7
export const skipLogin = env.DEV_SKIP_LOGIN;
