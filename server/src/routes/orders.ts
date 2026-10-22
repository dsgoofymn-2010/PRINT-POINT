import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { ah, badRequest, conflict, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { authenticate, currentUser } from '../middleware/auth';
import { writeInvoice } from '../services/invoice';
import { addEvent, orderDetailInclude } from '../services/orders';
import { cancelRequest } from '../services/requests';
import { broadcastOrder } from '../services/realtime';
import { initiateRefund } from '../services/payments';
import { whatsappLink } from '../services/notify';
import { formatINR } from '../lib/money';

export const ordersRouter = Router();
ordersRouter.use(authenticate);

const idParam = (v: unknown) => z.string().uuid().parse(v);

function describeItem(i: { printedPages: number; copies: number; color: string; paperSize: string; sides: string; binding: string; lamination: string }) {
  const parts = [`${i.printedPages} pages x ${i.copies}`, i.color === 'COLOR' ? 'Colour' : 'B/W', i.paperSize, i.sides === 'DOUBLE' ? 'Double-sided' : 'Single-sided'];
  if (i.binding !== 'NONE') parts.push(`${i.binding.toLowerCase()} binding`);
  if (i.lamination !== 'NONE') parts.push(`${i.lamination.toLowerCase()}-side lamination`);
  return parts.join(', ');
}

ordersRouter.get(
  '/',
  ah(async (req, res) => {
    const q = z.object({ status: z.enum(['DRAFT', 'ACTIVE', 'PAST']).optional() }).parse(req.query);
    const where: Prisma.PrintOrderWhereInput = { customerId: currentUser(req).id };
    if (q.status === 'DRAFT') where.status = 'DRAFT';
    if (q.status === 'ACTIVE') where.status = { in: ['REQUESTED', 'ACCEPTED', 'PENDING_PAYMENT', 'PAID', 'PRINTING', 'READY', 'OUT_FOR_DELIVERY'] };
    if (q.status === 'PAST') where.status = { in: ['COMPLETED', 'CANCELLED', 'DENIED', 'REFUNDED'] };
    const orders = await prisma.printOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { shop: { select: { id: true, name: true, area: true } }, items: { select: { fileName: true, printedPages: true, copies: true } } },
    });
    res.json({ orders });
  }),
);

ordersRouter.get(
  '/:id',
  ah(async (req, res) => {
    const user = currentUser(req);
    const order = await prisma.printOrder.findFirst({ where: { id: idParam(req.params.id), customerId: user.id }, include: orderDetailInclude });
    if (!order) throw notFound('Order not found');
    const notifyShopLink =
      order.orderNumber && ['PAID', 'PRINTING'].includes(order.status)
        ? whatsappLink(order.shop.mobile, `Hi ${order.shop.name}, I placed PrintPoint order ${order.orderNumber} (${formatINR(order.total)}, paid). Please confirm.`)
        : null;
    res.json({ order, notifyShopLink });
  }),
);

ordersRouter.post(
  '/:id/cancel',
  ah(async (req, res) => {
    const user = currentUser(req);
    const id = idParam(req.params.id);
    const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body ?? {});
    const order = await prisma.printOrder.findFirst({ where: { id, customerId: user.id } });
    if (!order) throw notFound('Order not found');

    if (order.status === 'REQUESTED') {
      await cancelRequest(id, user.id);
    } else if (order.status === 'DRAFT' || order.status === 'PENDING_PAYMENT') {
      await prisma.$transaction(async (tx) => {
        await tx.printOrder.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
        await tx.payment.updateMany({ where: { orderId: id, status: 'CREATED' }, data: { status: 'FAILED', failureReason: 'Cancelled by customer' } });
        await addEvent(tx, id, 'CANCELLED', user.id, reason ?? 'Cancelled by customer');
      });
      await broadcastOrder(id);
    } else if (order.status === 'PAID') {
      // Printing has not started yet, so a full refund is issued.
      await initiateRefund(id, null, reason ?? 'Cancelled by customer before printing', user.id);
    } else {
      throw conflict('This order is already being printed and cannot be cancelled. Please contact the shop.');
    }
    const updated = await prisma.printOrder.findUniqueOrThrow({ where: { id }, include: orderDetailInclude });
    res.json({ order: updated });
  }),
);

ordersRouter.get(
  '/:id/invoice',
  ah(async (req, res) => {
    const user = currentUser(req);
    const where: Prisma.PrintOrderWhereInput = { id: idParam(req.params.id) };
    if (user.role === 'CUSTOMER') where.customerId = user.id;
    else if (user.role === 'SHOP_OWNER') where.shop = { ownerId: user.id };
    const order = await prisma.printOrder.findFirst({ where, include: orderDetailInclude });
    if (!order || !order.orderNumber) throw notFound('Invoice is available after payment');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${order.orderNumber}.pdf"`);
    writeInvoice(res, {
      orderNumber: order.orderNumber,
      date: order.paidAt ?? order.createdAt,
      shop: order.shop,
      customer: order.customer,
      items: order.items.map((i) => ({ fileName: i.fileName, description: describeItem(i), lineTotal: i.lineTotal })),
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      discount: order.discount,
      tax: order.tax,
      total: order.total,
      paymentId: order.payments.find((p) => p.status === 'PAID' || p.status === 'REFUNDED')?.razorpayPaymentId ?? null,
    });
  }),
);

ordersRouter.post(
  '/:id/review',
  ah(async (req, res) => {
    const user = currentUser(req);
    const body = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(500).optional() }).parse(req.body);
    const order = await prisma.printOrder.findFirst({ where: { id: idParam(req.params.id), customerId: user.id, status: 'COMPLETED' }, include: { review: true } });
    if (!order) throw notFound('You can review completed orders only');
    if (order.review) throw conflict('You already reviewed this order');
    const review = await prisma.$transaction(async (tx) => {
      const r = await tx.review.create({ data: { orderId: order.id, shopId: order.shopId, customerId: user.id, rating: body.rating, comment: body.comment } });
      const agg = await tx.review.aggregate({ where: { shopId: order.shopId, deletedAt: null }, _avg: { rating: true }, _count: true });
      await tx.shop.update({ where: { id: order.shopId }, data: { rating: Math.round((agg._avg.rating ?? 0) * 10) / 10, ratingCount: agg._count } });
      return r;
    });
    res.status(201).json({ review });
  }),
);
