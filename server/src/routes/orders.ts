import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { ah, badRequest, conflict, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { authenticate, currentUser } from '../middleware/auth';
import { writeInvoice } from '../services/invoice';
import { addEvent, buildQuote, orderDetailInclude, quoteInputSchema } from '../services/orders';
import { ruleSnapshot } from '../services/pricing';
import { initiateRefund } from '../services/payments';
import { whatsappLink } from '../services/notify';
import { formatINR } from '../lib/money';

export const ordersRouter = Router();
ordersRouter.use(authenticate);

const mobile = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number');
const blank = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => (v === '' ? null : v), schema);
const deliverySchema = z.object({
  name: z.string().trim().min(2).max(80),
  mobile,
  address: z.string().trim().min(5).max(300),
  landmark: blank(z.string().trim().max(120).optional().nullable()),
  pincode: blank(z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit pincode').optional().nullable()),
  preferredTime: blank(z.string().trim().max(60).optional().nullable()),
});

const createSchema = quoteInputSchema.extend({
  specialInstructions: z.string().trim().max(1000).optional().nullable(),
  delivery: deliverySchema.optional().nullable(),
  saveAsDraft: z.boolean().default(false),
});

const idParam = (v: unknown) => z.string().uuid().parse(v);

ordersRouter.post(
  '/quote',
  ah(async (req, res) => {
    const input = quoteInputSchema.parse(req.body);
    const { quote } = await buildQuote(currentUser(req).id, input);
    res.json({ quote });
  }),
);

function describeItem(i: { printedPages: number; copies: number; color: string; paperSize: string; sides: string; binding: string; lamination: string }) {
  const parts = [`${i.printedPages} pages x ${i.copies}`, i.color === 'COLOR' ? 'Colour' : 'B/W', i.paperSize, i.sides === 'DOUBLE' ? 'Double-sided' : 'Single-sided'];
  if (i.binding !== 'NONE') parts.push(`${i.binding.toLowerCase()} binding`);
  if (i.lamination !== 'NONE') parts.push(`${i.lamination.toLowerCase()}-side lamination`);
  return parts.join(', ');
}

/** Creates (or replaces items of) an order from validated input. */
async function persistOrder(userId: string, body: z.infer<typeof createSchema>, existingId?: string) {
  if (body.fulfillment === 'DELIVERY' && !body.delivery && !body.saveAsDraft) throw badRequest('Enter delivery details');
  const built = await buildQuote(userId, body);
  const { quote } = built;
  if (!body.saveAsDraft && !quote.meetsMinimum) {
    throw badRequest(`Minimum order for this shop is ${formatINR(quote.minOrderAmount)}`);
  }

  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: body.shopId } });
  const status = body.saveAsDraft ? 'DRAFT' : 'PENDING_PAYMENT';
  const itemsData: Prisma.OrderItemCreateWithoutOrderInput[] = body.items.map((item, idx) => {
    const b = quote.items[idx];
    return {
      file: { connect: { id: item.fileId } },
      fileName: b.fileName,
      totalPages: b.totalPages,
      pageRange: item.settings.pageRange || null,
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
  });

  const data = {
    status,
    fulfillment: body.fulfillment,
    subtotal: quote.subtotal,
    deliveryFee: quote.deliveryFee,
    discount: quote.discount,
    tax: quote.tax,
    total: quote.total,
    couponId: built.couponId,
    priceSnapshot: { rule: ruleSnapshot(built.rule), quote } as unknown as Prisma.InputJsonValue,
    specialInstructions: body.specialInstructions ?? null,
    estimatedReadyAt: new Date(Date.now() + shop.estimatedPickupMins * 60_000),
  } as const;

  return prisma.$transaction(async (tx) => {
    let orderId: string;
    if (existingId) {
      await tx.orderItem.deleteMany({ where: { orderId: existingId } });
      await tx.delivery.deleteMany({ where: { orderId: existingId } });
      await tx.printOrder.update({ where: { id: existingId }, data: { ...data, shopId: shop.id, items: { create: itemsData } } });
      orderId = existingId;
    } else {
      const o = await tx.printOrder.create({ data: { ...data, customerId: userId, shopId: shop.id, items: { create: itemsData } } });
      orderId = o.id;
    }
    if (body.fulfillment === 'DELIVERY' && body.delivery) {
      await tx.delivery.create({ data: { orderId, ...body.delivery } });
    }
    await addEvent(tx, orderId, status, userId, status === 'DRAFT' ? 'Saved as draft' : 'Order placed');
    return tx.printOrder.findUniqueOrThrow({ where: { id: orderId }, include: orderDetailInclude });
  });
}

ordersRouter.post(
  '/',
  ah(async (req, res) => {
    const body = createSchema.parse(req.body);
    const order = await persistOrder(currentUser(req).id, body);
    res.status(201).json({ order });
  }),
);

/** Update a draft or an unpaid order (e.g. change options, then pay). */
ordersRouter.put(
  '/:id',
  ah(async (req, res) => {
    const user = currentUser(req);
    const id = idParam(req.params.id);
    const existing = await prisma.printOrder.findFirst({ where: { id, customerId: user.id } });
    if (!existing) throw notFound('Order not found');
    if (!['DRAFT', 'PENDING_PAYMENT'].includes(existing.status)) throw conflict('Only drafts or unpaid orders can be edited');
    const paid = await prisma.payment.findFirst({ where: { orderId: id, status: 'PAID' } });
    if (paid) throw conflict('This order is already paid');
    // Invalidate any open Razorpay order so the amount cannot mismatch.
    await prisma.payment.updateMany({ where: { orderId: id, status: 'CREATED' }, data: { status: 'FAILED', failureReason: 'Order edited' } });
    const order = await persistOrder(user.id, createSchema.parse(req.body), id);
    res.json({ order });
  }),
);

ordersRouter.get(
  '/',
  ah(async (req, res) => {
    const q = z.object({ status: z.enum(['DRAFT', 'ACTIVE', 'PAST']).optional() }).parse(req.query);
    const where: Prisma.PrintOrderWhereInput = { customerId: currentUser(req).id };
    if (q.status === 'DRAFT') where.status = 'DRAFT';
    if (q.status === 'ACTIVE') where.status = { in: ['PENDING_PAYMENT', 'PAID', 'PRINTING', 'READY', 'OUT_FOR_DELIVERY'] };
    if (q.status === 'PAST') where.status = { in: ['COMPLETED', 'CANCELLED', 'REFUNDED'] };
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

    if (order.status === 'DRAFT' || order.status === 'PENDING_PAYMENT') {
      await prisma.$transaction(async (tx) => {
        await tx.printOrder.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
        await tx.payment.updateMany({ where: { orderId: id, status: 'CREATED' }, data: { status: 'FAILED', failureReason: 'Cancelled by customer' } });
        await addEvent(tx, id, 'CANCELLED', user.id, reason ?? 'Cancelled by customer');
      });
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
  '/:id/reorder',
  ah(async (req, res) => {
    const user = currentUser(req);
    const src = await prisma.printOrder.findFirst({
      where: { id: idParam(req.params.id), customerId: user.id },
      include: { items: { include: { file: true } }, delivery: true },
    });
    if (!src) throw notFound('Order not found');
    const missing = src.items.filter((i) => i.file.deletedAt);
    if (missing.length) {
      throw conflict(`These files were deleted after the retention period. Please upload again: ${missing.map((m) => m.fileName).join(', ')}`);
    }
    const order = await persistOrder(user.id, {
      shopId: src.shopId,
      fulfillment: src.fulfillment,
      couponCode: null,
      saveAsDraft: true,
      specialInstructions: src.specialInstructions,
      delivery: src.delivery
        ? { name: src.delivery.name, mobile: src.delivery.mobile, address: src.delivery.address, landmark: src.delivery.landmark, pincode: src.delivery.pincode, preferredTime: src.delivery.preferredTime }
        : null,
      items: src.items.map((i) => ({
        fileId: i.fileId,
        pagesOverride: i.file.pageCount ? undefined : i.totalPages,
        settings: {
          color: i.color,
          paperSize: i.paperSize,
          sides: i.sides,
          paperQuality: i.paperQuality,
          copies: i.copies,
          pageRange: i.pageRange,
          orientation: i.orientation,
          fitMode: i.fitMode,
          binding: i.binding,
          lamination: i.lamination,
        },
      })),
    });
    res.status(201).json({ order });
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
