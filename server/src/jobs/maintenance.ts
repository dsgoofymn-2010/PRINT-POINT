import { env } from '../config/env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { storage } from '../services/storage';
import { addEvent } from '../services/orders';

const HOUR = 3_600_000;

/** Deletes customer files after the retention period (privacy requirement). */
export async function purgeExpiredFiles(now = new Date()) {
  const doneBefore = new Date(now.getTime() - env.FILE_RETENTION_HOURS * HOUR);
  const orphanBefore = new Date(now.getTime() - env.ORPHAN_FILE_RETENTION_HOURS * HOUR);

  const finishedOrders = await prisma.printOrder.findMany({
    where: {
      filesPurgedAt: null,
      OR: [
        { status: 'COMPLETED', completedAt: { lt: doneBefore } },
        { status: { in: ['CANCELLED', 'REFUNDED'] }, updatedAt: { lt: doneBefore } },
      ],
    },
    select: { id: true, items: { select: { fileId: true } } },
    take: 200,
  });

  // Files never attached to a paid/active order, e.g. abandoned uploads and drafts.
  const orphans = await prisma.uploadedFile.findMany({
    where: {
      deletedAt: null,
      createdAt: { lt: orphanBefore },
      orderItems: { none: { order: { status: { in: ['PAID', 'PRINTING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED'] } } } },
    },
    select: { id: true },
    take: 500,
  });

  const candidateIds = new Set([...finishedOrders.flatMap((o) => o.items.map((i) => i.fileId)), ...orphans.map((o) => o.id)]);
  let deleted = 0;
  for (const id of candidateIds) {
    // Keep a file if another order still needs it.
    const busy = await prisma.orderItem.findFirst({
      where: { fileId: id, order: { status: { in: ['PAID', 'PRINTING', 'READY', 'OUT_FOR_DELIVERY'] } } },
    });
    if (busy) continue;
    const file = await prisma.uploadedFile.findUnique({ where: { id } });
    if (!file || file.deletedAt) continue;
    await storage.remove(file.storageKey);
    await prisma.uploadedFile.update({ where: { id }, data: { deletedAt: new Date() } });
    deleted++;
  }
  if (finishedOrders.length) {
    await prisma.printOrder.updateMany({ where: { id: { in: finishedOrders.map((o) => o.id) } }, data: { filesPurgedAt: new Date() } });
  }
  if (deleted) logger.info({ deleted }, 'Purged expired files');
  return deleted;
}

/** Marks abandoned checkouts as failed and cancels very old unpaid orders. */
export async function expireStalePayments(now = new Date()) {
  const stale = await prisma.payment.updateMany({
    where: { status: 'CREATED', createdAt: { lt: new Date(now.getTime() - 30 * 60_000) } },
    data: { status: 'FAILED', failureReason: 'Payment timed out' },
  });
  const oldUnpaid = await prisma.printOrder.findMany({
    where: { status: 'PENDING_PAYMENT', updatedAt: { lt: new Date(now.getTime() - 24 * HOUR) } },
    select: { id: true },
  });
  for (const o of oldUnpaid) {
    await prisma.$transaction(async (tx) => {
      await tx.printOrder.update({ where: { id: o.id }, data: { status: 'CANCELLED', cancelledAt: now } });
      await addEvent(tx, o.id, 'CANCELLED', null, 'Payment not completed within 24 hours');
    });
  }
  return { expiredPayments: stale.count, cancelledOrders: oldUnpaid.length };
}

export function startMaintenanceJobs() {
  const run = async () => {
    try {
      await purgeExpiredFiles();
      await expireStalePayments();
    } catch (err) {
      logger.error({ err }, 'Maintenance job failed');
    }
  };
  setTimeout(run, 10_000);
  return setInterval(run, 15 * 60_000);
}
