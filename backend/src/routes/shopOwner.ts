import { Router, type Request } from 'express';
import { z } from 'zod';
import type { OrderStatus, Prisma, ServiceType, Shop } from '@prisma/client';
import { razorpayConfigured } from '../config/env';
import { ah, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { shopExists } from '../lib/mainShop';
import { authenticate, currentUser, requireRole } from '../middleware/auth';
import { addEvent, orderDetailInclude, SHOP_TRANSITIONS } from '../services/orders';
import { initiateRefund } from '../services/payments';
import { calculateQuote, ruleSnapshot } from '../services/pricing';
import { printSettingsSchema } from '../services/orders';
import { pickupLimiter } from '../middleware/rateLimit';
import { broadcastOrder, emitShopChanged, joinOwnerToShop } from '../services/realtime';
import { acceptRequest, collectWithCode, denyRequest, manuallyOpen, markPrinting, markReady, maskMobile, proposeNewTime, queueInfo } from '../services/requests';

export const shopOwnerRouter = Router();
shopOwnerRouter.use(authenticate, requireRole('SHOP_OWNER', 'ADMIN'));

const SERVICE_TYPES = [
  'XEROX_BW', 'COLOR_PRINT', 'PROJECT_REPORT', 'SPIRAL_BINDING', 'SOFT_BINDING', 'HARD_BINDING', 'LAMINATION', 'SCANNING', 'PASSPORT_PHOTO',
] as const satisfies readonly ServiceType[];
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24h)');

/** Keeps only the last 4 characters of a bank/UPI reference. */
const mask = (v: string | undefined | null) => (v ? `${'*'.repeat(Math.max(0, v.length - 4))}${v.slice(-4)}` : undefined);

const profileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  ownerName: z.string().trim().min(2).max(80),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile'),
  email: z.string().trim().email().optional().nullable(),
  address: z.string().trim().min(5).max(300),
  area: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(60),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit pincode'),
  mapsUrl: z.string().url().max(500).optional().nullable().or(z.literal('')),
  openTime: hhmm,
  closeTime: hhmm,
  holidays: z.array(z.enum(DAYS)).max(7).default([]),
  services: z.array(z.enum(SERVICE_TYPES)).min(1, 'Select at least one service'),
  deliveryAvailable: z.boolean().default(false),
  deliveryRadiusKm: z.number().min(0).max(50).default(0),
  estimatedPickupMins: z.number().int().min(5).max(1440).default(30),
  payoutUpi: z.string().trim().max(100).optional(),
  payoutAccount: z.string().trim().max(30).optional(),
});

const pricingSchema = z.object({
  name: z.string().trim().min(1).max(60).default('Standard'),
  bwSingle: z.number().int().min(0).max(100_000),
  bwDouble: z.number().int().min(0).max(100_000),
  colorSingle: z.number().int().min(0).max(100_000),
  colorDouble: z.number().int().min(0).max(100_000),
  a3Multiplier: z.number().min(1).max(10).default(2),
  legalMultiplier: z.number().min(1).max(10).default(1.2),
  bondExtra: z.number().int().min(0).max(100_000).default(0),
  glossyExtra: z.number().int().min(0).max(100_000).default(0),
  spiralBinding: z.number().int().min(0).max(1_000_000).default(0),
  softBinding: z.number().int().min(0).max(1_000_000).default(0),
  hardBinding: z.number().int().min(0).max(1_000_000).default(0),
  laminationSingle: z.number().int().min(0).max(1_000_000).default(0),
  laminationDouble: z.number().int().min(0).max(1_000_000).default(0),
  deliveryFee: z.number().int().min(0).max(1_000_000).default(0),
  freeDeliveryAbove: z.number().int().min(0).max(10_000_000).nullable().default(null),
  minOrderAmount: z.number().int().min(0).max(10_000_000).default(0),
  taxPercent: z.number().min(0).max(28).default(0),
});

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 50) + '-' + Math.random().toString(36).slice(2, 7);

/** Resolves the shop this request acts on: ?shopId=... or the owner's first shop. */
async function myShop(req: Request): Promise<Shop> {
  const user = currentUser(req);
  const shopId = typeof req.query.shopId === 'string' ? req.query.shopId : undefined;
  const shop = await prisma.shop.findFirst({
    where: { deletedAt: null, ...(shopId ? { id: shopId } : {}), ...(user.role === 'ADMIN' ? {} : { ownerId: user.id }) },
    orderBy: { createdAt: 'asc' },
  });
  if (!shop) throw notFound('Register your shop first');
  return shop;
}

function shopData(body: z.infer<typeof profileSchema>) {
  const { services, payoutUpi, payoutAccount, mapsUrl, ...rest } = body;
  void services;
  return {
    ...rest,
    mapsUrl: mapsUrl || null,
    ...(payoutUpi !== undefined ? { payoutUpiMasked: mask(payoutUpi) } : {}),
    ...(payoutAccount !== undefined ? { payoutAccountMasked: mask(payoutAccount) } : {}),
  };
}

shopOwnerRouter.post(
  '/register',
  ah(async (req, res) => {
    const user = currentUser(req);
    // Single-shop app: only the first shop can be registered, and it goes live right away.
    if (await shopExists()) throw conflict('This app is set up for one shop, and it already exists.');
    const body = profileSchema.extend({ pricing: pricingSchema.optional() }).parse(req.body);
    const shop = await prisma.shop.create({
      data: {
        ...shopData(body),
        ownerId: user.id,
        slug: slugify(body.name),
        status: 'APPROVED',
        services: { create: body.services.map((type) => ({ type })) },
        pricingRules: {
          create: body.pricing ?? {
            bwSingle: 150, bwDouble: 100, colorSingle: 1000, colorDouble: 800, spiralBinding: 4000, softBinding: 6000, hardBinding: 15000, laminationSingle: 1500, laminationDouble: 2500, deliveryFee: 3000,
          },
        },
      },
      include: { services: true, pricingRules: true },
    });
    joinOwnerToShop(user.id, shop.id);
    res.status(201).json({ shop });
  }),
);

shopOwnerRouter.get(
  '/shops',
  ah(async (req, res) => {
    const shops = await prisma.shop.findMany({ where: { ownerId: currentUser(req).id, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    res.json({ shops });
  }),
);

shopOwnerRouter.get(
  '/profile',
  ah(async (req, res) => {
    const shop = await myShop(req);
    const services = await prisma.shopService.findMany({ where: { shopId: shop.id } });
    res.json({ shop: { ...shop, services: services.map((s) => s.type) } });
  }),
);

shopOwnerRouter.put(
  '/profile',
  ah(async (req, res) => {
    const shop = await myShop(req);
    const body = profileSchema.parse(req.body);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.shopService.deleteMany({ where: { shopId: shop.id } });
      await tx.shopService.createMany({ data: body.services.map((type) => ({ shopId: shop.id, type })) });
      return tx.shop.update({ where: { id: shop.id }, data: shopData(body) });
    });
    emitShopChanged(shop.id);
    res.json({ shop: updated });
  }),
);

shopOwnerRouter.get(
  '/dashboard',
  ah(async (req, res) => {
    const shop = await myShop(req);
    const start = startOfDayIST();
    const [today, pending, completedToday, recent] = await Promise.all([
      prisma.printOrder.aggregate({ where: { shopId: shop.id, paidAt: { gte: start } }, _sum: { total: true }, _count: true }),
      prisma.printOrder.count({ where: { shopId: shop.id, status: { in: ['REQUESTED', 'ACCEPTED', 'PAID', 'PRINTING', 'READY', 'OUT_FOR_DELIVERY'] } } }),
      prisma.printOrder.count({ where: { shopId: shop.id, status: 'COMPLETED', completedAt: { gte: start } } }),
      prisma.printOrder.findMany({
        where: { shopId: shop.id, status: { notIn: ['DRAFT', 'PENDING_PAYMENT'] } },
        orderBy: { paidAt: 'desc' },
        take: 10,
        include: { customer: { select: { name: true } }, items: { select: { printedPages: true, copies: true } } },
      }),
    ]);
    res.json({
      shop: { id: shop.id, name: shop.name, status: shop.status },
      stats: { todayOrders: today._count, todayRevenue: today._sum.total ?? 0, pendingOrders: pending, completedToday },
      recent,
    });
  }),
);

// ---------- Pricing CRUD ----------

shopOwnerRouter.get(
  '/pricing',
  ah(async (req, res) => {
    const shop = await myShop(req);
    const rules = await prisma.pricingRule.findMany({ where: { shopId: shop.id }, orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }] });
    res.json({ rules });
  }),
);

shopOwnerRouter.post(
  '/pricing',
  ah(async (req, res) => {
    const shop = await myShop(req);
    const body = pricingSchema.extend({ activate: z.boolean().default(false) }).parse(req.body);
    const { activate, ...data } = body;
    const rule = await prisma.$transaction(async (tx) => {
      const hasActive = await tx.pricingRule.count({ where: { shopId: shop.id, isActive: true } });
      const makeActive = activate || hasActive === 0;
      if (makeActive) await tx.pricingRule.updateMany({ where: { shopId: shop.id }, data: { isActive: false } });
      return tx.pricingRule.create({ data: { ...data, shopId: shop.id, isActive: makeActive } });
    });
    res.status(201).json({ rule });
  }),
);

async function ownedRule(req: Request) {
  const shop = await myShop(req);
  const rule = await prisma.pricingRule.findFirst({ where: { id: z.string().uuid().parse(req.params.id), shopId: shop.id } });
  if (!rule) throw notFound('Pricing rule not found');
  return { shop, rule };
}

shopOwnerRouter.put(
  '/pricing/:id',
  ah(async (req, res) => {
    const { rule } = await ownedRule(req);
    const data = pricingSchema.parse(req.body);
    // Existing orders keep their own price snapshot, so editing is safe.
    const updated = await prisma.pricingRule.update({ where: { id: rule.id }, data });
    emitShopChanged(rule.shopId);
    res.json({ rule: updated });
  }),
);

shopOwnerRouter.post(
  '/pricing/:id/activate',
  ah(async (req, res) => {
    const { shop, rule } = await ownedRule(req);
    await prisma.$transaction([
      prisma.pricingRule.updateMany({ where: { shopId: shop.id }, data: { isActive: false } }),
      prisma.pricingRule.update({ where: { id: rule.id }, data: { isActive: true } }),
    ]);
    emitShopChanged(shop.id);
    res.json({ ok: true });
  }),
);

shopOwnerRouter.delete(
  '/pricing/:id',
  ah(async (req, res) => {
    const { rule } = await ownedRule(req);
    if (rule.isActive) throw conflict('Activate another rule before deleting the active one');
    await prisma.pricingRule.delete({ where: { id: rule.id } });
    res.json({ ok: true });
  }),
);

/** Bulk update: raise/lower all per-page rates by a percentage. */
shopOwnerRouter.post(
  '/pricing/:id/bulk',
  ah(async (req, res) => {
    const { rule } = await ownedRule(req);
    const { percent, scope } = z
      .object({ percent: z.number().min(-90).max(500), scope: z.enum(['PER_PAGE', 'ADDONS', 'ALL']).default('PER_PAGE') })
      .parse(req.body);
    const f = (v: number) => Math.max(0, Math.round(v * (1 + percent / 100)));
    const perPage = { bwSingle: f(rule.bwSingle), bwDouble: f(rule.bwDouble), colorSingle: f(rule.colorSingle), colorDouble: f(rule.colorDouble) };
    const addons = {
      bondExtra: f(rule.bondExtra), glossyExtra: f(rule.glossyExtra), spiralBinding: f(rule.spiralBinding), softBinding: f(rule.softBinding),
      hardBinding: f(rule.hardBinding), laminationSingle: f(rule.laminationSingle), laminationDouble: f(rule.laminationDouble),
    };
    const data = scope === 'PER_PAGE' ? perPage : scope === 'ADDONS' ? addons : { ...perPage, ...addons };
    const updated = await prisma.pricingRule.update({ where: { id: rule.id }, data });
    emitShopChanged(rule.shopId);
    res.json({ rule: updated });
  }),
);

/** Preview a quote with unsaved prices, so owners see what customers will pay. */
shopOwnerRouter.post(
  '/pricing/preview',
  ah(async (req, res) => {
    const body = z
      .object({ rule: pricingSchema, pages: z.number().int().min(1).max(2000), fulfillment: z.enum(['PICKUP', 'DELIVERY']).default('PICKUP'), settings: printSettingsSchema })
      .parse(req.body);
    const quote = calculateQuote(ruleSnapshot(body.rule), [{ key: 'sample', fileName: 'Sample document', totalPages: body.pages, settings: body.settings }], body.fulfillment);
    res.json({ quote });
  }),
);

// ---------- Orders ----------

const STATUS_FILTERS = ['NEW', 'PRINTING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED', 'ALL'] as const;

function orderWhere(shopId: string, status: (typeof STATUS_FILTERS)[number], from?: Date, to?: Date): Prisma.PrintOrderWhereInput {
  const where: Prisma.PrintOrderWhereInput = { shopId, status: { notIn: ['DRAFT', 'PENDING_PAYMENT'] } };
  if (status === 'NEW') where.status = 'PAID';
  else if (status === 'CANCELLED') where.status = { in: ['CANCELLED', 'REFUNDED'] };
  else if (status !== 'ALL') where.status = status;
  if (from || to) where.paidAt = { gte: from, lte: to };
  return where;
}

shopOwnerRouter.get(
  '/orders',
  ah(async (req, res) => {
    const shop = await myShop(req);
    const q = z.object({ status: z.enum(STATUS_FILTERS).default('ALL'), since: z.coerce.date().optional() }).parse(req.query);
    const orders = await prisma.printOrder.findMany({
      where: { ...orderWhere(shop.id, q.status), ...(q.since ? { paidAt: { gt: q.since } } : {}) },
      orderBy: { paidAt: 'desc' },
      take: 200,
      include: { customer: { select: { name: true, mobile: true } }, items: { select: { fileName: true, printedPages: true, copies: true, color: true } }, delivery: true },
    });
    res.json({ orders: orders.map(({ pickupOtp, ...o }) => (void pickupOtp, { ...o, customer: { ...o.customer, mobile: maskMobile(o.customer.mobile) } })) });
  }),
);

shopOwnerRouter.get(
  '/orders/export',
  ah(async (req, res) => {
    const shop = await myShop(req);
    const q = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }).parse(req.query);
    const orders = await prisma.printOrder.findMany({
      where: orderWhere(shop.id, 'ALL', q.from, q.to),
      orderBy: { paidAt: 'asc' },
      include: { customer: { select: { name: true, mobile: true } }, items: true },
    });
    // Prefix risky leading characters to avoid CSV formula injection in Excel.
    const cell = (v: unknown) => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@]/.test(s)) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const header = ['Order', 'Paid at', 'Status', 'Customer', 'Mobile', 'Fulfillment', 'Files', 'Pages', 'Subtotal (Rs)', 'Delivery (Rs)', 'Discount (Rs)', 'Tax (Rs)', 'Total (Rs)', 'Commission (Rs)'];
    const lines = orders.map((o) =>
      [
        o.orderNumber, o.paidAt?.toISOString(), o.status, o.customer.name, o.customer.mobile, o.fulfillment, o.items.length,
        o.items.reduce((s, i) => s + i.printedPages * i.copies, 0), o.subtotal / 100, o.deliveryFee / 100, o.discount / 100, o.tax / 100, o.total / 100, o.commissionAmount / 100,
      ].map(cell).join(','),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('﻿' + [header.map(cell).join(','), ...lines].join('\r\n'));
  }),
);

async function shopOrder(req: Request) {
  const shop = await myShop(req);
  const order = await prisma.printOrder.findFirst({
    where: { id: z.string().uuid().parse(req.params.id), shopId: shop.id, status: { notIn: ['DRAFT', 'PENDING_PAYMENT'] } },
    include: orderDetailInclude,
  });
  if (!order) throw notFound('Order not found');
  return order;
}

shopOwnerRouter.get(
  '/orders/:id',
  ah(async (req, res) => {
    const order = await shopOrder(req);
    // The pickup OTP is the customer's proof of collection; never reveal it to the shop.
    res.json({ order: forShop(order) });
  }),
);

shopOwnerRouter.patch(
  '/orders/:id/status',
  ah(async (req, res) => {
    const user = currentUser(req);
    const order = await shopOrder(req);
    const body = z
      .object({
        status: z.enum(['PRINTING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED']),
        note: z.string().trim().max(300).optional(),
        pickupOtp: z.string().regex(/^\d{6}$/).optional(),
        partnerName: z.string().trim().max(80).optional(),
        partnerMobile: z.string().trim().max(15).optional(),
      })
      .parse(req.body);

    if (order.fulfillment === 'PICKUP' && body.status !== 'CANCELLED') {
      throw badRequest('Use the request actions (accept, printing, ready, verify code) for pickup orders');
    }
    const allowed = SHOP_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(body.status)) throw conflict(`Cannot move an order from ${order.status} to ${body.status}`);
    if (body.status === 'READY' && order.fulfillment !== 'PICKUP') throw badRequest('Use "Out for delivery" for delivery orders');
    if (body.status === 'OUT_FOR_DELIVERY' && order.fulfillment !== 'DELIVERY') throw badRequest('Use "Ready" for pickup orders');

    if (body.status === 'CANCELLED') {
      // Paid orders cancelled by the shop are always refunded in full.
      await initiateRefund(order.id, null, body.note ?? 'Cancelled by shop', user.id);
    } else {
      await prisma.$transaction(async (tx) => {
        await tx.printOrder.update({
          where: { id: order.id },
          data: { status: body.status as OrderStatus, ...(body.status === 'COMPLETED' ? { completedAt: new Date() } : {}) },
        });
        if (order.delivery && body.status === 'OUT_FOR_DELIVERY') {
          await tx.delivery.update({ where: { orderId: order.id }, data: { status: 'OUT_FOR_DELIVERY', partnerName: body.partnerName, partnerMobile: body.partnerMobile } });
        }
        if (order.delivery && body.status === 'COMPLETED') {
          await tx.delivery.update({ where: { orderId: order.id }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
        }
        await addEvent(tx, order.id, body.status as OrderStatus, user.id, body.note);
      });
    }
    await broadcastOrder(order.id);
    const updated = await prisma.printOrder.findUniqueOrThrow({ where: { id: order.id }, include: orderDetailInclude });
    res.json({ order: forShop(updated) });
  }),
);

shopOwnerRouter.post(
  '/orders/:id/refund',
  ah(async (req, res) => {
    const user = currentUser(req);
    const order = await shopOrder(req);
    if (order.status === 'COMPLETED' && user.role !== 'ADMIN') throw forbidden('Contact PrintPoint support to refund completed orders');
    const body = z.object({ amount: z.number().int().positive().optional(), reason: z.string().trim().min(3).max(300) }).parse(req.body);
    const refund = await initiateRefund(order.id, body.amount ?? null, body.reason, user.id);
    res.status(201).json({ refund });
  }),
);

// ---------- Incoming requests (chat flow) ----------

type ShopOrder = Awaited<ReturnType<typeof shopOrder>>;

/** What a shop may see of an order: masked phone, no pickup code. */
function forShop(o: ShopOrder) {
  const { pickupOtp, ...rest } = o;
  void pickupOtp;
  return { ...rest, customer: { ...o.customer, mobile: maskMobile(o.customer.mobile), email: null } };
}

const requestListInclude = {
  customer: { select: { name: true, mobile: true } },
  items: {
    select: {
      id: true, fileId: true, fileName: true, totalPages: true, printedPages: true, copies: true, color: true, sides: true, binding: true, lineTotal: true,
      file: { select: { deletedAt: true, mimeType: true, sizeBytes: true } },
    },
  },
} satisfies Prisma.PrintOrderInclude;

type RequestRow = Prisma.PrintOrderGetPayload<{ include: typeof requestListInclude }>;

/** List/card view for owners: masked phone, never the pickup code. */
function requestForShop(o: RequestRow) {
  const { pickupOtp, ...rest } = o;
  void pickupOtp;
  return { ...rest, customer: { name: o.customer.name, mobile: maskMobile(o.customer.mobile) } };
}

const LIVE: OrderStatus[] = ['REQUESTED', 'ACCEPTED', 'PAID', 'PRINTING', 'READY'];
const DONE: OrderStatus[] = ['COMPLETED', 'DENIED', 'CANCELLED', 'REFUNDED'];

shopOwnerRouter.get(
  '/requests',
  ah(async (req, res) => {
    const shop = await myShop(req);
    const { scope } = z.object({ scope: z.enum(['active', 'done']).default('active') }).parse(req.query);
    const start = startOfDayIST();
    const [orders, grouped, completedToday, queue] = await Promise.all([
      prisma.printOrder.findMany({
        where:
          scope === 'active'
            ? { shopId: shop.id, status: { in: LIVE } }
            : { shopId: shop.id, status: { in: DONE }, updatedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: requestListInclude,
      }),
      prisma.printOrder.groupBy({ by: ['status'], where: { shopId: shop.id, status: { in: LIVE } }, _count: true }),
      prisma.printOrder.count({ where: { shopId: shop.id, status: 'COMPLETED', completedAt: { gte: start } } }),
      queueInfo(shop.id).catch(() => null),
    ]);
    const n = (st: OrderStatus) => grouped.find((g) => g.status === st)?._count ?? 0;
    res.json({
      shop: {
        id: shop.id,
        name: shop.name,
        status: shop.status,
        acceptingRequests: manuallyOpen(shop),
        reopensAt: manuallyOpen(shop) ? null : shop.reopensAt,
        nextOpenAt: queue?.nextOpenAt ?? null,
        openTime: shop.openTime,
        closeTime: shop.closeTime,
        estimatedPickupMins: shop.estimatedPickupMins,
        isOpen: queue?.isOpen ?? false,
        withinHours: queue?.withinHours ?? false,
      },
      counts: { pending: n('REQUESTED'), accepted: n('ACCEPTED') + n('PAID'), printing: n('PRINTING'), ready: n('READY'), completedToday },
      onlinePayment: razorpayConfigured,
      orders: orders.map(requestForShop),
    });
  }),
);

/** Resolves an order of the caller's own shop; anything else is a 404. */
async function ownRequest(req: Request) {
  const user = currentUser(req);
  const id = z.string().uuid().parse(req.params.id);
  // Any of the caller's own shops; admins may act on any shop.
  const order = await prisma.printOrder.findFirst({
    where: { id, shop: { deletedAt: null, ...(user.role === 'ADMIN' ? {} : { ownerId: user.id }) } },
    select: { id: true, shop: { select: { id: true, estimatedPickupMins: true } } },
  });
  if (!order) throw notFound('Request not found');
  return { id: order.id, shop: order.shop };
}

const reply = async (id: string) => ({
  order: requestForShop(await prisma.printOrder.findUniqueOrThrow({ where: { id }, include: requestListInclude })),
});

shopOwnerRouter.post(
  '/requests/:id/accept',
  ah(async (req, res) => {
    const { id, shop } = await ownRequest(req);
    const { readyInMinutes } = z.object({ readyInMinutes: z.number().int().min(5).max(24 * 60).optional() }).parse(req.body ?? {});
    await acceptRequest(id, currentUser(req).id, readyInMinutes ?? shop.estimatedPickupMins);
    res.json(await reply(id));
  }),
);

shopOwnerRouter.post(
  '/requests/:id/deny',
  ah(async (req, res) => {
    const { id } = await ownRequest(req);
    const { reason } = z
      .object({ reason: z.string().trim().min(3, 'Tell the customer why (at least 3 characters)').max(200) })
      .parse(req.body ?? {});
    await denyRequest(id, currentUser(req).id, reason);
    res.json(await reply(id));
  }),
);

shopOwnerRouter.post(
  '/requests/:id/printing',
  ah(async (req, res) => {
    const { id } = await ownRequest(req);
    await markPrinting(id, currentUser(req).id);
    res.json(await reply(id));
  }),
);

shopOwnerRouter.post(
  '/requests/:id/ready',
  ah(async (req, res) => {
    const { id } = await ownRequest(req);
    await markReady(id, currentUser(req).id);
    res.json(await reply(id));
  }),
);

shopOwnerRouter.post(
  '/requests/:id/collect',
  pickupLimiter,
  ah(async (req, res) => {
    const { id } = await ownRequest(req);
    const { code } = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit pickup code') }).parse(req.body ?? {});
    await collectWithCode(id, currentUser(req).id, code);
    res.json(await reply(id));
  }),
);

shopOwnerRouter.post(
  '/requests/:id/new-time',
  ah(async (req, res) => {
    const { id } = await ownRequest(req);
    const { time, note } = z
      .object({ time: z.coerce.date(), note: z.string().trim().max(200).optional().nullable() })
      .parse(req.body ?? {});
    await proposeNewTime(id, currentUser(req).id, time, note || null);
    res.json(await reply(id));
  }),
);

/**
 * Owner's manual open/closed switch (opening hours still apply on top).
 * When closing, `reopensAt` tells customers when to book for; the shop opens itself again then.
 */
shopOwnerRouter.post(
  '/open',
  ah(async (req, res) => {
    const shop = await myShop(req);
    const { open, reopensAt } = z
      .object({ open: z.boolean(), reopensAt: z.coerce.date().optional().nullable() })
      .parse(req.body);
    if (!open && reopensAt) {
      if (reopensAt.getTime() <= Date.now()) throw badRequest('Pick a reopening time in the future');
      if (reopensAt.getTime() > Date.now() + 30 * 86_400_000) throw badRequest('Pick a reopening time within 30 days');
    }
    await prisma.shop.update({
      where: { id: shop.id },
      data: { acceptingRequests: open, reopensAt: open ? null : (reopensAt ?? null) },
    });
    emitShopChanged(shop.id);
    res.json({ acceptingRequests: open, queue: await queueInfo(shop.id).catch(() => null) });
  }),
);

// ---------- Analytics ----------

function startOfDayIST(d = new Date()): Date {
  const ist = new Date(d.getTime() + 330 * 60_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 330 * 60_000);
}

shopOwnerRouter.get(
  '/analytics',
  ah(async (req, res) => {
    const shop = await myShop(req);
    const { days } = z.object({ days: z.coerce.number().int().refine((v) => v === 7 || v === 30).default(7) }).parse(req.query);
    const from = new Date(startOfDayIST().getTime() - (days - 1) * 86_400_000);
    const orders = await prisma.printOrder.findMany({
      where: { shopId: shop.id, paidAt: { gte: from }, status: { notIn: ['DRAFT', 'PENDING_PAYMENT'] } },
      select: { paidAt: true, total: true, status: true, items: { select: { color: true, binding: true, lamination: true, printedPages: true, copies: true } } },
    });

    const series = Array.from({ length: days }, (_, i) => {
      const date = new Date(from.getTime() + i * 86_400_000 + 330 * 60_000).toISOString().slice(0, 10);
      return { date, orders: 0, revenue: 0 };
    });
    const services: Record<string, number> = {};
    let revenue = 0;
    let counted = 0;
    for (const o of orders) {
      if (!o.paidAt) continue;
      const idx = Math.floor((o.paidAt.getTime() - from.getTime()) / 86_400_000);
      const refunded = o.status === 'REFUNDED' || o.status === 'CANCELLED';
      if (series[idx]) {
        series[idx].orders += 1;
        if (!refunded) series[idx].revenue += o.total;
      }
      if (!refunded) {
        revenue += o.total;
        counted += 1;
      }
      for (const it of o.items) {
        const k = it.color === 'COLOR' ? 'Colour printing' : 'B/W xerox';
        services[k] = (services[k] ?? 0) + it.printedPages * it.copies;
        if (it.binding !== 'NONE') services[`${it.binding[0]}${it.binding.slice(1).toLowerCase()} binding`] = (services[`${it.binding[0]}${it.binding.slice(1).toLowerCase()} binding`] ?? 0) + it.copies;
        if (it.lamination !== 'NONE') services['Lamination'] = (services['Lamination'] ?? 0) + it.copies;
      }
    }
    res.json({
      days,
      series,
      totals: { orders: orders.length, revenue, averageOrderValue: counted ? Math.round(revenue / counted) : 0 },
      topServices: Object.entries(services).map(([name, units]) => ({ name, units })).sort((a, b) => b.units - a.units).slice(0, 6),
    });
  }),
);

shopOwnerRouter.get(
  '/notifications',
  ah(async (req, res) => {
    const notifications = await prisma.notification.findMany({ where: { userId: currentUser(req).id }, orderBy: { createdAt: 'desc' }, take: 30 });
    res.json({ notifications });
  }),
);
