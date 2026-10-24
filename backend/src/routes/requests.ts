import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { razorpayConfigured } from '../config/env';
import { ah, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { authenticate, currentUser } from '../middleware/auth';
import { requestLimiter } from '../middleware/rateLimit';
import { buildQuote } from '../services/orders';
import { cancelRequest, createRequest, requestInputSchema, toQuoteInput } from '../services/requests';

/** Customer side of the chat flow: price, send, follow and cancel requests. */
export const requestsRouter = Router();
requestsRouter.use(authenticate);

export const customerRequestInclude = {
  shop: { select: { id: true, name: true, area: true, address: true, mobile: true, mapsUrl: true } },
  items: {
    select: {
      id: true, fileId: true, fileName: true, printedPages: true, copies: true, color: true, sides: true, binding: true, lineTotal: true,
      file: { select: { deletedAt: true, sizeBytes: true, mimeType: true } },
    },
  },
  events: { orderBy: { createdAt: 'asc' }, select: { status: true, note: true, createdAt: true } },
} satisfies Prisma.PrintOrderInclude;

type CustomerOrder = Prisma.PrintOrderGetPayload<{ include: typeof customerRequestInclude }>;

/** The pickup code is shown only while the order is on its way to being collected. */
export function forCustomer(o: CustomerOrder) {
  const showCode = ['ACCEPTED', 'PAID', 'PRINTING', 'READY'].includes(o.status);
  const { pickupOtp, pickupAttempts, commissionAmount, commissionPercent, ...rest } = o;
  void pickupAttempts;
  void commissionAmount;
  void commissionPercent;
  return { ...rest, pickupOtp: showCode ? pickupOtp : null, onlinePayment: razorpayConfigured };
}

const idParam = (v: unknown) => z.string().uuid().parse(v);

requestsRouter.post(
  '/quote',
  ah(async (req, res) => {
    const input = requestInputSchema.omit({ note: true }).parse(req.body);
    const { quote, rule } = await buildQuote(currentUser(req).id, toQuoteInput(input));
    res.json({ quote, rates: { bwSingle: rule.bwSingle, bwDouble: rule.bwDouble, colorSingle: rule.colorSingle, colorDouble: rule.colorDouble, spiralBinding: rule.spiralBinding, taxPercent: rule.taxPercent } });
  }),
);

requestsRouter.post(
  '/',
  requestLimiter,
  ah(async (req, res) => {
    const input = requestInputSchema.parse(req.body);
    const created = await createRequest(currentUser(req).id, input);
    const order = await prisma.printOrder.findUniqueOrThrow({ where: { id: created.id }, include: customerRequestInclude });
    res.status(201).json({ order: forCustomer(order) });
  }),
);

requestsRouter.get(
  '/',
  ah(async (req, res) => {
    const orders = await prisma.printOrder.findMany({
      where: { customerId: currentUser(req).id, status: { notIn: ['DRAFT'] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: customerRequestInclude,
    });
    res.json({ orders: orders.map(forCustomer) });
  }),
);

requestsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const order = await prisma.printOrder.findFirst({ where: { id: idParam(req.params.id), customerId: currentUser(req).id }, include: customerRequestInclude });
    if (!order) throw notFound('Request not found');
    res.json({ order: forCustomer(order) });
  }),
);

requestsRouter.post(
  '/:id/cancel',
  ah(async (req, res) => {
    const user = currentUser(req);
    const id = idParam(req.params.id);
    await cancelRequest(id, user.id);
    const order = await prisma.printOrder.findUniqueOrThrow({ where: { id }, include: customerRequestInclude });
    res.json({ order: forCustomer(order) });
  }),
);
