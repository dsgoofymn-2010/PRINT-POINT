import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { ah, badRequest, conflict, notFound } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { authenticate, currentUser } from '../middleware/auth';
import { paymentLimiter } from '../middleware/rateLimit';
import { markFailed, markPaid, onRefundProcessed } from '../services/payments';
import { razorpay, verifyCheckoutSignature, verifyWebhookSignature } from '../services/razorpay';

export const paymentsRouter = Router();

/** Razorpay orders older than this are treated as stale and recreated. */
const RZP_ORDER_REUSE_MINUTES = 25;

paymentsRouter.post(
  '/create-order',
  authenticate,
  paymentLimiter,
  ah(async (req, res) => {
    const user = currentUser(req);
    const { orderId } = z.object({ orderId: z.string().uuid() }).parse(req.body);
    const order = await prisma.printOrder.findFirst({ where: { id: orderId, customerId: user.id }, include: { customer: true, shop: true } });
    if (!order) throw notFound('Order not found');
    // Request flow: the customer pays once the shop has accepted.
    if (order.status !== 'PENDING_PAYMENT' && order.status !== 'ACCEPTED') {
      throw conflict(order.status === 'REQUESTED' ? 'Wait for the shop to accept before paying' : 'This order is not awaiting payment');
    }
    if (order.total < 100) throw badRequest('Order total must be at least ₹1');

    let payment = await prisma.payment.findFirst({
      where: { orderId, status: 'CREATED', amount: order.total, createdAt: { gt: new Date(Date.now() - RZP_ORDER_REUSE_MINUTES * 60_000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) {
      const rzpOrder = await razorpay().orders.create({
        amount: order.total,
        currency: 'INR',
        receipt: order.id.slice(0, 40),
        notes: { orderId: order.id, shopId: order.shopId },
      });
      payment = await prisma.payment.create({
        data: { orderId, razorpayOrderId: rzpOrder.id, amount: order.total, currency: 'INR', status: 'CREATED' },
      });
    }

    res.json({
      keyId: env.RAZORPAY_KEY_ID, // public key only; the secret never leaves the server
      razorpayOrderId: payment.razorpayOrderId,
      amount: payment.amount,
      currency: payment.currency,
      name: 'PrintPoint',
      description: `Print order at ${order.shop.name}`,
      prefill: { name: order.customer.name, email: order.customer.email ?? '', contact: order.customer.mobile ?? '' },
    });
  }),
);

paymentsRouter.post(
  '/verify',
  authenticate,
  paymentLimiter,
  ah(async (req, res) => {
    const user = currentUser(req);
    const body = z
      .object({
        razorpay_order_id: z.string().min(1).max(100),
        razorpay_payment_id: z.string().min(1).max(100),
        razorpay_signature: z.string().min(1).max(200),
      })
      .parse(req.body);

    const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: body.razorpay_order_id }, include: { order: true } });
    if (!payment || payment.order.customerId !== user.id) throw notFound('Payment not found');

    if (!verifyCheckoutSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) {
      await markFailed(body.razorpay_order_id, 'Signature verification failed', body.razorpay_payment_id);
      logger.warn({ orderId: payment.orderId }, 'Razorpay signature mismatch');
      throw badRequest('Payment verification failed. If money was deducted it will be refunded automatically.');
    }

    // Defence in depth: confirm with Razorpay that this payment belongs to the order and amount.
    const rp = await razorpay().payments.fetch(body.razorpay_payment_id);
    if (rp.order_id !== body.razorpay_order_id || Number(rp.amount) !== payment.amount || !['captured', 'authorized'].includes(rp.status)) {
      throw badRequest('Payment could not be confirmed with Razorpay');
    }

    const order = await markPaid({
      razorpayOrderId: body.razorpay_order_id,
      razorpayPaymentId: body.razorpay_payment_id,
      signature: body.razorpay_signature,
      method: rp.method,
    });
    res.json({ ok: true, orderId: order.id, orderNumber: order.orderNumber, status: order.status });
  }),
);

/** Called by the frontend when Checkout reports a failure or the user dismisses it. */
paymentsRouter.post(
  '/failed',
  authenticate,
  paymentLimiter,
  ah(async (req, res) => {
    const body = z
      .object({ razorpayOrderId: z.string().min(1).max(100), reason: z.string().max(500).default('Payment failed'), razorpayPaymentId: z.string().max(100).optional() })
      .parse(req.body);
    const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: body.razorpayOrderId }, include: { order: true } });
    if (!payment || payment.order.customerId !== currentUser(req).id) throw notFound('Payment not found');
    await markFailed(body.razorpayOrderId, body.reason, body.razorpayPaymentId);
    res.json({ ok: true });
  }),
);

interface WebhookBody {
  event: string;
  payload: {
    payment?: { entity: { id: string; order_id: string; amount: number; method?: string; error_description?: string } };
    refund?: { entity: { id: string; payment_id: string; amount: number } };
  };
}

paymentsRouter.post(
  '/webhook',
  ah(async (req, res) => {
    const signature = String(req.headers['x-razorpay-signature'] ?? '');
    if (!req.rawBody || !verifyWebhookSignature(req.rawBody, signature)) {
      return res.status(400).json({ error: { code: 'BAD_SIGNATURE', message: 'Invalid webhook signature' } });
    }
    const body = req.body as WebhookBody;
    const eventId = String(req.headers['x-razorpay-event-id'] ?? '');

    if (eventId) {
      // Razorpay retries webhooks; the unique id lets us drop duplicates.
      const fresh = await prisma.webhookEvent.createMany({ data: [{ id: eventId, event: body.event }], skipDuplicates: true });
      if (fresh.count === 0) return res.json({ ok: true, duplicate: true });
    }

    try {
      const p = body.payload.payment?.entity;
      switch (body.event) {
        case 'payment.captured':
          if (p) await markPaid({ razorpayOrderId: p.order_id, razorpayPaymentId: p.id, method: p.method });
          break;
        case 'payment.failed':
          if (p) await markFailed(p.order_id, p.error_description ?? 'Payment failed', p.id);
          break;
        case 'refund.processed': {
          const r = body.payload.refund?.entity;
          if (r) await onRefundProcessed(r.id, r.payment_id, r.amount);
          break;
        }
        default:
          logger.debug({ event: body.event }, 'Ignoring webhook event');
      }
    } catch (err) {
      // Let Razorpay retry by forgetting this event id.
      if (eventId) await prisma.webhookEvent.delete({ where: { id: eventId } }).catch(() => undefined);
      throw err;
    }
    res.json({ ok: true });
  }),
);
