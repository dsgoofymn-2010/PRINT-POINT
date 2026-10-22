import { env, razorpayConfigured } from './config/env';
import { createApp } from './app';
import { startMaintenanceJobs } from './jobs/maintenance';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`PrintPoint API listening on http://localhost:${env.PORT}/api/v1`);
  if (!razorpayConfigured) logger.warn('Razorpay keys missing: online payments are disabled until you add test keys to server/.env');
});
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
