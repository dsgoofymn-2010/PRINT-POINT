import { env, razorpayConfigured, skipLogin } from './config/env';
import { createApp } from './app';
import { startMaintenanceJobs } from './jobs/maintenance';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { attachRealtime } from './services/realtime';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`PrintPoint API listening on http://localhost:${env.PORT}/api/v1`);
  if (!razorpayConfigured) logger.warn('Razorpay keys missing: online payments are disabled until you add test keys to server/.env');
});
if (skipLogin) logger.warn('DEMO MODE: no sign-in; anyone can act as customer, shop owner or admin (DEV_SKIP_LOGIN=true).');
attachRealtime(server);
const timer = startMaintenanceJobs();

const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down`);
  clearInterval(timer);
  server.close(() => void prisma.$disconnect().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled rejection'));
