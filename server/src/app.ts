import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import path from 'node:path';
import fs from 'node:fs';
import { corsOrigins, isProd, razorpayConfigured } from './config/env';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/error';
import { apiLimiter } from './middleware/rateLimit';
import { authRouter } from './routes/auth';
import { shopsRouter } from './routes/shops';
import { uploadsRouter } from './routes/uploads';
import { ordersRouter } from './routes/orders';
import { paymentsRouter } from './routes/payments';
import { shopOwnerRouter } from './routes/shopOwner';
import { adminRouter } from './routes/admin';
import { meRouter } from './routes/me';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
          frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
          connectSrc: ["'self'", 'https://lumberjack.razorpay.com', 'https://api.razorpay.com'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => (!origin || corsOrigins.includes(origin) ? cb(null, true) : cb(new Error('Origin not allowed'))),
      credentials: true,
    }),
  );
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/v1/health' } }));
  // Keep the raw body so Razorpay webhook signatures can be verified byte-for-byte.
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    }),
  );
  app.use(cookieParser());

  const api = express.Router();
  api.get('/health', (_req, res) => res.json({ ok: true, payments: razorpayConfigured }));
  api.use(apiLimiter);
  api.use('/auth', authRouter);
  api.use('/shops', shopsRouter);
  api.use('/uploads', uploadsRouter);
  api.use('/orders', ordersRouter);
  api.use('/payments', paymentsRouter);
  api.use('/shop', shopOwnerRouter);
  api.use('/admin', adminRouter);
  api.use('/me', meRouter);
  api.use(notFoundHandler);
  app.use('/api/v1', api);

  // In production the API also serves the built frontend.
  const webDist = path.resolve(process.env.WEB_DIST_DIR ?? path.join(process.cwd(), '../client/dist'));
  if (isProd && fs.existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
