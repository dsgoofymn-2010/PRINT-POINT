import type { OrderStatus, Prisma, Shop } from '@prisma/client';
import { z } from 'zod';
import { razorpayConfigured } from '../config/env';
import { badRequest, conflict, notFound } from '../lib/errors';
import { logger } from '../lib/logger';
import { getMainShopId } from '../lib/mainShop';
import { prisma } from '../lib/prisma';
import { formatIST, isShopOpen, nextRegularOpening, todaysHours } from '../lib/shopHours';
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
  // Book a later time, e.g. when the shop is closed. Empty = as soon as possible.
  scheduledFor: z.coerce.date().optional().nullable(),
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

type HoursShop = Pick<Shop, 'openTime' | 'closeTime' | 'holidays' | 'acceptingRequests' | 'reopensAt' | 'status'>;

/** The owner's open switch, which turns itself back on once the set reopening time passes. */
export function manuallyOpen(shop: Pick<Shop, 'acceptingRequests' | 'reopensAt'>, now = new Date()) {
  return shop.acceptingRequests || (shop.reopensAt != null && shop.reopensAt <= now);
}

export function shopIsTakingRequests(shop: HoursShop, now = new Date()) {
  return shop.status === 'APPROVED' && manuallyOpen(shop, now) && isShopOpen(shop, now);
}

/**
 * When a closed shop takes requests again: the reopening time the shop set, or the
 * start of its next opening hours. Null while open, or if closed with no time set.
 */
export function nextOpening(shop: HoursShop, now = new Date()): Date | null {
  if (shop.status !== 'APPROVED' || shopIsTakingRequests(shop, now)) return null;
  let from = now;
  if (!manuallyOpen(shop, now)) {
    if (!shop.reopensAt) return null;
    from = shop.reopensAt;
  }
  return isShopOpen(shop, from) ? from : nextRegularOpening(shop, from);
}

const MAX_BOOK_AHEAD_MS = 7 * 86_400_000;

/** Checks a booked time: the shop must be open then, and it must be within a week. */
function checkScheduledTime(shop: HoursShop & { name: string }, when: Date | null | undefined, now = new Date()): Date | null {
  const openNow = shopIsTakingRequests(shop, now);
  if (!when) {
    if (openNow) return null;
    const next = nextOpening(shop, now);
    throw conflict(
      next
        ? `${shop.name} is closed right now. It opens ${formatIST(next)}; book your request for then.`
        : `${shop.name} is closed right now and hasn't set a reopening time yet. Please check back later.`,
    );
  }
  if (when.getTime() < now.getTime() - 60_000) throw badRequest('Pick a time in the future');
  if (when.getTime() > now.getTime() + MAX_BOOK_AHEAD_MS) throw badRequest('You can book up to 7 days ahead');
  if (!openNow) {
    const next = nextOpening(shop, now);
    if (!next) throw conflict(`${shop.name} hasn't set a reopening time yet. Please check back later.`);
    if (when < next) throw badRequest(`${shop.name} opens ${formatIST(next)}. Pick that time or later.`);
  }
  if (!isShopOpen(shop, when)) throw badRequest(`${shop.name} is closed at that time. Pick a time within its opening hours.`);
  return when;
}

export async function createRequest(customerId: string, input: RequestInput) {
  if (input.shopId !== (await getMainShopId())) throw badRequest('Requests can only be sent to this shop');
  const shop = await prisma.shop.findFirst({ where: { id: input.shopId, status: 'APPROVED', deletedAt: null } });
  if (!shop) throw notFound('Shop not found');
  const scheduledFor = checkScheduledTime(shop, input.scheduledFor);

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
        scheduledFor,
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
    await addEvent(tx, o.id, 'REQUESTED', customerId, scheduledFor ? `Request sent, booked for ${formatIST(scheduledFor)}` : 'Request sent to shop');
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
  const order = await prisma.printOrder.findUniqueOrThrow({ where: { id: orderId }, select: { scheduledFor: true } });
  // A booked order is ready that long after its booked time, not after now.
  const start = Math.max(Date.now(), order.scheduledFor?.getTime() ?? 0);
  const readyAt = new Date(start + readyInMinutes * 60_000);
  await transition(orderId, ['REQUESTED'], 'ACCEPTED', actorId, `Accepted, ready by ${formatIST(readyAt)}`, {
    acceptedAt: new Date(),
    estimatedReadyAt: readyAt,
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

/** Statuses where the shop can still ask to move the order to another time. */
const RESCHEDULABLE: OrderStatus[] = ['REQUESTED', 'ACCEPTED', 'PAID'];

/** Shop is busy: ask the customer to move the order to a new time. The customer accepts or declines. */
export async function proposeNewTime(orderId: string, actorId: string, time: Date, note: string | null) {
  if (time.getTime() < Date.now()) throw badRequest('Pick a time in the future');
  if (time.getTime() > Date.now() + MAX_BOOK_AHEAD_MS) throw badRequest('Pick a time within the next 7 days');
  const done = await prisma.$transaction(async (tx) => {
    const order = await tx.printOrder.findUnique({ where: { id: orderId }, select: { status: true } });
    if (!order || !RESCHEDULABLE.includes(order.status)) return false;
    const r = await tx.printOrder.updateMany({
      where: { id: orderId, status: order.status },
      data: { proposedTime: time, proposedNote: note },
    });
    if (r.count === 0) return false;
    await addEvent(tx, orderId, order.status, actorId, `Shop asked to move it to ${formatIST(time)}${note ? `: ${note}` : ''}`);
    return true;
  });
  if (!done) throw conflict('This order can no longer be moved. Refresh to see its latest status.');
  await broadcastOrder(orderId);
}

/** The customer's answer to the shop's new time. Accepting moves the order; declining keeps the old time. */
export async function answerNewTime(orderId: string, customerId: string, accept: boolean) {
  const done = await prisma.$transaction(async (tx) => {
    const order = await tx.printOrder.findFirst({ where: { id: orderId, customerId } });
    if (!order) throw notFound('Request not found');
    if (!order.proposedTime) return false;
    const moveReady = accept && order.estimatedReadyAt != null;
    await tx.printOrder.update({
      where: { id: orderId },
      data: {
        proposedTime: null,
        proposedNote: null,
        ...(accept ? { scheduledFor: order.proposedTime } : {}),
        ...(moveReady ? { estimatedReadyAt: order.proposedTime } : {}),
      },
    });
    await addEvent(tx, orderId, order.status, customerId, accept ? `Customer agreed to ${formatIST(order.proposedTime)}` : 'Customer kept the original time');
    return true;
  });
  if (!done) throw conflict('The shop has no time change waiting for your answer.');
  await broadcastOrder(orderId);
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
<<<<<<< HEAD
    prisma.printOrder.count({ where: { shopId, status: 'REQUESTED' } }),
=======
    // Everything in line that isn't on the printer yet.
    prisma.printOrder.count({ where: { shopId, status: { in: ['REQUESTED', 'ACCEPTED', 'PAID'] } } }),
>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7
    prisma.printOrder.count({ where: { shopId, status: 'PRINTING' } }),
    prisma.orderItem.findMany({
      where: { order: { shopId, status: { in: ['ACCEPTED', 'PAID', 'PRINTING'] } } },
      select: { printedPages: true, copies: true, orderId: true },
    }),
    prisma.pricingRule.findFirst({ where: { shopId, isActive: true }, orderBy: { updatedAt: 'desc' } }),
  ]);
  const pagesAhead = ahead.reduce((s, i) => s + i.printedPages * i.copies, 0);
<<<<<<< HEAD
  const jobsAhead = new Set(ahead.map((i) => i.orderId)).size + pending;
  const estimatedWaitMins = Math.max(5, Math.ceil(pagesAhead / PAGES_PER_MINUTE + jobsAhead * MINUTES_PER_JOB));
=======
  const jobsAhead = pending + printing;
  const estimatedWaitMins = jobsAhead === 0 ? 0 : Math.max(5, Math.ceil(pagesAhead / PAGES_PER_MINUTE + jobsAhead * MINUTES_PER_JOB));
>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7

  return {
    shopId: shop.id,
    name: shop.name,
    isOpen: shopIsTakingRequests(shop),
    acceptingRequests: manuallyOpen(shop),
    reopensAt: manuallyOpen(shop) ? null : shop.reopensAt,
    nextOpenAt: nextOpening(shop)?.toISOString() ?? null,
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
