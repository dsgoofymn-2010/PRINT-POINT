import type { OrderStatus, Prisma, Shop } from '@prisma/client';
import { z } from 'zod';
import { razorpayConfigured } from '../config/env';
import { badRequest, conflict, notFound } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { isShopOpen, todaysHours } from '../lib/shopHours';
import { randomDigits, safeEqual } from '../lib/tokens';
import { addEvent, buildQuote, nextOrderNumber } from './orders';
import { ruleSnapshot } from './pricing';
import { broadcastOrder } from './realtime';
import { storage } from './storage';

/**
 * Request lifecycle (pickup only):
 *   REQUESTED -> ACCEPTED -> PAID -> PRINTING -> READY -> COMPLETED
 *   REQUESTED -> DENIED (shop, with reason) | CANCELLED (customer)
 * Without Razorpay keys the shop may go ACCEPTED -> PRINTING and collect cash at the counter.
 */

/** Orders the shop still has to act on; their files must be kept. */
export const ACTIVE_STATUSES: OrderStatus[] = ['REQUESTED', 'ACCEPTED', 'PAID', 'PRINTING', 'READY', 'OUT_FOR_DELIVERY'];
/** Wrong pickup codes allowed before the code is replaced with a new one. */
export const MAX_PICKUP_ATTEMPTS = 5;

// Rough throughput used for the wait estimate shown to customers.
const PAGES_PER_MINUTE = 20;
const MINUTES_PER_JOB = 3;

export const requestInputSchema = z.object({
  shopId: z.string().uuid(),
  files: z
    .array(z.object({ fileId: z.string().uuid(), pagesOverride: z.coerce.number().int().min(1).max(2000).optional() }))
    .min(1, 'Upload at least one file')
    .max(10, 'Send at most 10 files per request'),
  options: z.object({
    color: z.enum(['BW', 'COLOR']),
    sides: z.enum(['SINGLE', 'DOUBLE']),
    copies: z.coerce.number().int().min(1).max(100),
    binding: z.enum(['NONE', 'SPIRAL']),
  }),
  note: z.string().trim().max(500).optional().nullable(),
});
export type RequestInput = z.infer<typeof requestInputSchema>;

/** The chat flow uses a fixed paper setup; only the asked-for options vary. */
export function toQuoteInput(input: Pick<RequestInput, 'shopId' | 'files' | 'options'>) {
  return {
    shopId: input.shopId,
    fulfillment: 'PICKUP' as const,
    couponCode: null,
    items: input.files.map((f) => ({
      fileId: f.fileId,
      pagesOverride: f.pagesOverride,
      settings: {
        ...input.options,
        paperSize: 'A4' as const,
        paperQuality: 'NORMAL_70' as const,
        pageRange: null,
        orientation: 'PORTRAIT' as const,
        fitMode: 'FIT' as const,
        lamination: 'NONE' as const,
      },
    })),
  };
}

export function shopIsTakingRequests(shop: Pick<Shop, 'openTime' | 'closeTime' | 'holidays' | 'acceptingRequests' | 'status'>) {
  return shop.status === 'APPROVED' && shop.acceptingRequests && isShopOpen(shop);
}

export async function createRequest(customerId: string, input: RequestInput) {
  const shop = await prisma.shop.findFirst({ where: { id: input.shopId, status: 'APPROVED', deletedAt: null } });
  if (!shop) throw notFound('Shop not found');
  if (!shopIsTakingRequests(shop)) throw conflict(`${shop.name} is closed right now. Try again during opening hours or choose another shop.`);

  const built = await buildQuote(customerId, toQuoteInput(input));
  const { quote } = built;
  if (!quote.meetsMinimum) throw badRequest(`This shop's minimum order is ₹${(quote.minOrderAmount / 100).toFixed(2)}`);

  const order = await prisma.$transaction(async (tx) => {
    const o = await tx.printOrder.create({
      data: {
        orderNumber: await nextOrderNumber(tx),
        customerId,
        shopId: shop.id,
        status: 'REQUESTED',
        fulfillment: 'PICKUP',
        subtotal: quote.subtotal,
        deliveryFee: 0,
        discount: 0,
        tax: quote.tax,
        total: quote.total,
        priceSnapshot: { rule: ruleSnapshot(built.rule), quote } as unknown as Prisma.InputJsonValue,
        specialInstructions: input.note || null,
        items: {
          create: toQuoteInput(input).items.map((item, idx) => {
            const b = quote.items[idx];
            return {
              file: { connect: { id: item.fileId } },
              fileName: b.fileName,
              totalPages: b.totalPages,
              pageRange: null,
              printedPages: b.printedPages,
              copies: item.settings.copies,
              color: item.settings.color,
              paperSize: item.settings.paperSize,
              sides: item.settings.sides,
              paperQuality: item.settings.paperQuality,
              orientation: item.settings.orientation,
              fitMode: item.settings.fitMode,
              binding: item.settings.binding,
              lamination: item.settings.lamination,
              lineTotal: b.lineTotal,
              breakdown: b as unknown as Prisma.InputJsonValue,
            };
          }),
        },
      },
    });
    await addEvent(tx, o.id, 'REQUESTED', customerId, 'Request sent to shop');
    return o;
  });
  await broadcastOrder(order.id, 'created');
  return order;
}

/**
 * Moves an order only if it is still in one of the expected states, so two
 * clicks (or owner + customer at once) cannot both win.
 */
async function transition(
  orderId: string,
  from: OrderStatus[],
  to: OrderStatus,
  actorId: string,
  note: string | undefined,
  data: Prisma.PrintOrderUpdateManyMutationInput = {},
) {
  const done = await prisma.$transaction(async (tx) => {
    const r = await tx.printOrder.updateMany({ where: { id: orderId, status: { in: from } }, data: { ...data, status: to } });
    if (r.count === 0) return false;
    await addEvent(tx, orderId, to, actorId, note);
    return true;
  });
  if (!done) throw conflict('This request was already updated. Refresh to see its latest status.');
  await broadcastOrder(orderId);
}

export async function cancelRequest(orderId: string, customerId: string) {
  const order = await prisma.printOrder.findFirst({ where: { id: orderId, customerId } });
  if (!order) throw notFound('Request not found');
  if (order.status !== 'REQUESTED') throw conflict('Only requests still waiting for the shop can be cancelled. Please contact the shop.');
  await transition(orderId, ['REQUESTED'], 'CANCELLED', customerId, 'Cancelled by customer', { cancelledAt: new Date() });
  await purgeOrderFiles(orderId);
}

export async function acceptRequest(orderId: string, actorId: string, readyInMinutes: number) {
  await transition(orderId, ['REQUESTED'], 'ACCEPTED', actorId, `Accepted, ready in about ${readyInMinutes} min`, {
    acceptedAt: new Date(),
    estimatedReadyAt: new Date(Date.now() + readyInMinutes * 60_000),
    pickupOtp: randomDigits(6),
    pickupAttempts: 0,
  });
}

export async function denyRequest(orderId: string, actorId: string, reason: string) {
  await transition(orderId, ['REQUESTED'], 'DENIED', actorId, reason, { denyReason: reason, cancelledAt: new Date() });
  await purgeOrderFiles(orderId);
}

export async function markPrinting(orderId: string, actorId: string) {
  // Without online payments configured the shop collects payment at the counter.
  const from: OrderStatus[] = razorpayConfigured ? ['PAID'] : ['PAID', 'ACCEPTED'];
  const order = await prisma.printOrder.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status === 'ACCEPTED' && razorpayConfigured) throw conflict('Wait for the customer to pay before printing');
  await transition(orderId, from, 'PRINTING', actorId, undefined);
}

export async function markReady(orderId: string, actorId: string) {
  await transition(orderId, ['PRINTING'], 'READY', actorId, undefined);
}

/**
 * Verifies the customer's pickup code and completes the order. The code is single use
 * and scoped to this order (the caller already checked the order belongs to the shop).
 * After MAX_PICKUP_ATTEMPTS wrong tries the code is replaced, which makes guessing useless.
 */
export async function collectWithCode(orderId: string, actorId: string, code: string) {
  const order = await prisma.printOrder.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== 'READY') throw conflict('Mark the order ready before handing it over');
  if (!order.pickupOtp) throw conflict('This order has no pickup code');

  if (!safeEqual(code, order.pickupOtp)) {
    const attempts = order.pickupAttempts + 1;
    if (attempts >= MAX_PICKUP_ATTEMPTS) {
      await prisma.printOrder.update({ where: { id: orderId }, data: { pickupOtp: randomDigits(6), pickupAttempts: 0 } });
      await broadcastOrder(orderId); // the customer's card shows the new code
      throw badRequest('Too many wrong codes. A new code was sent to the customer’s app; ask them to read it again.');
    }
    await prisma.printOrder.update({ where: { id: orderId }, data: { pickupAttempts: attempts } });
    throw badRequest(`Wrong pickup code. ${MAX_PICKUP_ATTEMPTS - attempts} tries left before it is reset.`);
  }

  await transition(orderId, ['READY'], 'COMPLETED', actorId, 'Collected by customer', {
    completedAt: new Date(),
    pickupOtp: null, // single use
    pickupAttempts: 0,
  });
  await purgeOrderFiles(orderId);
}

/** Deletes an order's files right away unless another live request still uses them. */
export async function purgeOrderFiles(orderId: string) {
  try {
    const items = await prisma.orderItem.findMany({ where: { orderId }, select: { fileId: true } });
    for (const { fileId } of items) {
      const busy = await prisma.orderItem.findFirst({ where: { fileId, orderId: { not: orderId }, order: { status: { in: ACTIVE_STATUSES } } } });
      if (busy) continue;
      const file = await prisma.uploadedFile.findUnique({ where: { id: fileId } });
      if (!file || file.deletedAt) continue;
      await storage.remove(file.storageKey);
      await prisma.uploadedFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } });
    }
    await prisma.printOrder.update({ where: { id: orderId }, data: { filesPurgedAt: new Date() } });
  } catch (err) {
    // The maintenance job retries anything left behind.
    logger.error({ err, orderId }, 'Immediate file purge failed');
  }
}

/** Public queue numbers for the side panel. */
export async function queueInfo(shopId: string) {
  const shop = await prisma.shop.findFirst({ where: { id: shopId, status: 'APPROVED', deletedAt: null } });
  if (!shop) throw notFound('Shop not found');
  const [pending, printing, ahead, rule] = await Promise.all([
    prisma.printOrder.count({ where: { shopId, status: 'REQUESTED' } }),
    prisma.printOrder.count({ where: { shopId, status: 'PRINTING' } }),
    prisma.orderItem.findMany({
      where: { order: { shopId, status: { in: ['ACCEPTED', 'PAID', 'PRINTING'] } } },
      select: { printedPages: true, copies: true, orderId: true },
    }),
    prisma.pricingRule.findFirst({ where: { shopId, isActive: true }, orderBy: { updatedAt: 'desc' } }),
  ]);
  const pagesAhead = ahead.reduce((s, i) => s + i.printedPages * i.copies, 0);
  const jobsAhead = new Set(ahead.map((i) => i.orderId)).size + pending;
  const estimatedWaitMins = Math.max(5, Math.ceil(pagesAhead / PAGES_PER_MINUTE + jobsAhead * MINUTES_PER_JOB));

  return {
    shopId: shop.id,
    name: shop.name,
    isOpen: shopIsTakingRequests(shop),
    acceptingRequests: shop.acceptingRequests,
    withinHours: isShopOpen(shop),
    hoursToday: todaysHours(shop),
    pending,
    printing,
    estimatedWaitMins,
    prices: rule
      ? {
          bwSingle: rule.bwSingle,
          bwDouble: rule.bwDouble,
          colorSingle: rule.colorSingle,
          colorDouble: rule.colorDouble,
          spiralBinding: rule.spiralBinding,
          taxPercent: rule.taxPercent,
          minOrderAmount: rule.minOrderAmount,
        }
      : null,
    updatedAt: new Date().toISOString(),
  };
}

/** "98xxxxx210" style: everything hidden except the last 4 digits. */
export const maskMobile = (m: string | null | undefined) => (m ? `${'•'.repeat(Math.max(0, m.length - 4))}${m.slice(-4)}` : null);
