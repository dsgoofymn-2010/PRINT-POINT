import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { badRequest, conflict, notFound } from '../lib/errors';
import { randomDigits } from '../lib/tokens';
import { newOrderShopMessage, recordNotification, whatsappLink } from './notify';
import { addEvent, commissionPercent, nextOrderNumber } from './orders';
import { razorpay } from './razorpay';
import { broadcastOrder } from './realtime';

interface PaidArgs {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature?: string;
  method?: string;
}

/**
 * Marks a payment and its order as paid. Idempotent: safe to call from both the
 * checkout verify endpoint and the payment.captured webhook.
 */
export async function markPaid(args: PaidArgs) {
  const pct = await commissionPercent();
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { razorpayOrderId: args.razorpayOrderId }, include: { order: true } });
    if (!payment) throw notFound('Payment not found');
    if (payment.status === 'PAID' || payment.status === 'REFUNDED') return { order: payment.order, newlyPaid: false };

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        razorpayPaymentId: args.razorpayPaymentId,
        razorpaySignature: args.signature ?? payment.razorpaySignature,
        method: args.method ?? payment.method,
        failureReason: null,
      },
    });

    // Money arrived for an order that was cancelled meanwhile (e.g. timeout) -> refund it.
    if (payment.order.status !== 'PENDING_PAYMENT' && payment.order.status !== 'ACCEPTED') {
      return { order: payment.order, newlyPaid: false, refundNeeded: payment.order.status === 'CANCELLED' };
    }

    const order = await tx.printOrder.update({
      where: { id: payment.orderId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        orderNumber: payment.order.orderNumber ?? (await nextOrderNumber(tx)),
        // Request-flow orders already got their code when the shop accepted.
        pickupOtp: payment.order.fulfillment === 'PICKUP' ? (payment.order.pickupOtp ?? randomDigits(6)) : null,
        commissionPercent: pct,
        commissionAmount: Math.round((payment.order.subtotal * pct) / 100),
      },
    });
    await addEvent(tx, order.id, 'PAID', null, 'Payment confirmed');
    if (order.couponId) await tx.coupon.update({ where: { id: order.couponId }, data: { usedCount: { increment: 1 } } });
    return { order, newlyPaid: true };
  });

  if ('refundNeeded' in result && result.refundNeeded) {
    await initiateRefund(result.order.id, null, 'Payment received after order was cancelled', null).catch((err) =>
      logger.error({ err }, 'Auto refund failed'),
    );
  }

  if (result.newlyPaid) {
    await notifyShopOfNewOrder(result.order.id).catch((err) => logger.error({ err }, 'notify failed'));
    await broadcastOrder(result.order.id);
  }
  return result.order;
}

async function notifyShopOfNewOrder(orderId: string) {
  const order = await prisma.printOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { shop: true, customer: { select: { name: true } } },
  });
  const message = newOrderShopMessage({
    orderNumber: order.orderNumber ?? order.id,
    total: order.total,
    fulfillment: order.fulfillment,
    customerName: order.customer.name,
  });
  await recordNotification({
    userId: order.shop.ownerId,
    orderId,
    channel: 'WHATSAPP_LINK',
    recipient: order.shop.mobile,
    message,
    link: whatsappLink(order.shop.mobile, message),
  });
}

export async function markFailed(razorpayOrderId: string, reason: string, razorpayPaymentId?: string) {
  await prisma.payment.updateMany({
    where: { razorpayOrderId, status: 'CREATED' },
    data: { status: 'FAILED', failureReason: reason.slice(0, 500), ...(razorpayPaymentId ? { razorpayPaymentId } : {}) },
  });
}

/** Starts a Razorpay refund for the order's captured payment. amount=null means full refund. */
export async function initiateRefund(orderId: string, amount: number | null, reason: string, actorId: string | null) {
  const payment = await prisma.payment.findFirst({ where: { orderId, status: 'PAID' }, orderBy: { createdAt: 'desc' } });
  if (!payment?.razorpayPaymentId) throw badRequest('No captured payment to refund for this order');

  const already = await prisma.refund.aggregate({
    where: { paymentId: payment.id, status: { in: ['PENDING', 'PROCESSED'] } },
    _sum: { amount: true },
  });
  const remaining = payment.amount - (already._sum.amount ?? 0);
  const refundAmount = amount ?? remaining;
  if (refundAmount <= 0 || refundAmount > remaining) throw conflict('Refund amount exceeds the refundable balance');

  const rp = await razorpay().payments.refund(payment.razorpayPaymentId, {
    amount: refundAmount,
    notes: { orderId, reason: reason.slice(0, 200) },
  });

  const processed = rp.status === 'processed';
  const refund = await prisma.$transaction(async (tx) => {
    const r = await tx.refund.create({
      data: {
        paymentId: payment.id,
        orderId,
        razorpayRefundId: rp.id,
        amount: refundAmount,
        status: processed ? 'PROCESSED' : 'PENDING',
        reason,
        initiatedById: actorId,
      },
    });
    const order = await tx.printOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (!['CANCELLED', 'REFUNDED'].includes(order.status)) {
      await tx.printOrder.update({ where: { id: orderId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      await addEvent(tx, orderId, 'CANCELLED', actorId, reason);
    }
    if (processed) await finalizeRefund(tx, payment.id, orderId, refundAmount === remaining);
    return r;
  });
  await broadcastOrder(orderId);
  return refund;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function finalizeRefund(tx: Tx, paymentId: string, orderId: string, full: boolean) {
  if (!full) return;
  await tx.payment.update({ where: { id: paymentId }, data: { status: 'REFUNDED' } });
  const order = await tx.printOrder.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== 'REFUNDED') {
    await tx.printOrder.update({ where: { id: orderId }, data: { status: 'REFUNDED' } });
    await addEvent(tx, orderId, 'REFUNDED', null, 'Refund processed');
  }
}

/** Handles refund.processed webhook. */
export async function onRefundProcessed(razorpayRefundId: string, razorpayPaymentId: string, amount: number) {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { razorpayPaymentId } });
    if (!payment) return;
    let refund = await tx.refund.findUnique({ where: { razorpayRefundId } });
    if (!refund) {
      // Refund created directly in the Razorpay dashboard
      refund = await tx.refund.create({
        data: { paymentId: payment.id, orderId: payment.orderId, razorpayRefundId, amount, status: 'PROCESSED', reason: 'Dashboard refund' },
      });
    } else if (refund.status !== 'PROCESSED') {
      await tx.refund.update({ where: { id: refund.id }, data: { status: 'PROCESSED' } });
    }
    const total = await tx.refund.aggregate({ where: { paymentId: payment.id, status: 'PROCESSED' }, _sum: { amount: true } });
    await finalizeRefund(tx, payment.id, payment.orderId, (total._sum.amount ?? 0) >= payment.amount);
  });
}
