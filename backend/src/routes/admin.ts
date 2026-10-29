import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { ah, badRequest, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { authenticate, currentUser, requireRole } from '../middleware/auth';
import { audit } from '../services/audit';
import { commissionPercent } from '../services/orders';
import { initiateRefund } from '../services/payments';

export const adminRouter = Router();
adminRouter.use(authenticate, requireRole('ADMIN'));

const page = z.object({ page: z.coerce.number().int().min(1).default(1), q: z.string().trim().max(80).optional() });
const PAGE_SIZE = 50;
const uuid = (v: unknown) => z.string().uuid().parse(v);

adminRouter.get(
  '/shops',
  ah(async (req, res) => {
    const q = page.extend({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional() }).parse(req.query);
    const where: Prisma.ShopWhereInput = { deletedAt: null, ...(q.status ? { status: q.status } : {}) };
    if (q.q) where.OR = [{ name: { contains: q.q, mode: 'insensitive' } }, { area: { contains: q.q, mode: 'insensitive' } }];
    const [shops, total] = await Promise.all([
      prisma.shop.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { owner: { select: { name: true, email: true, mobile: true } }, _count: { select: { orders: true } } },
      }),
      prisma.shop.count({ where }),
    ]);
    res.json({ shops, total });
  }),
);

const statusAction = (status: 'APPROVED' | 'REJECTED' | 'SUSPENDED', action: string) =>
  ah(async (req, res) => {
    const id = uuid(req.params.id);
    const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body ?? {});
    const before = await prisma.shop.findUnique({ where: { id } });
    if (!before) throw notFound('Shop not found');
    const shop = await prisma.shop.update({ where: { id }, data: { status } });
    await audit(req, action, 'Shop', id, { from: before.status, to: status, reason: reason ?? null });
    res.json({ shop });
  });

adminRouter.patch('/shops/:id/approve', statusAction('APPROVED', 'shop.approve'));
adminRouter.patch('/shops/:id/reject', statusAction('REJECTED', 'shop.reject'));
adminRouter.patch('/shops/:id/suspend', statusAction('SUSPENDED', 'shop.suspend'));

adminRouter.get(
  '/users',
  ah(async (req, res) => {
    const q = page.extend({ role: z.enum(['CUSTOMER', 'SHOP_OWNER', 'ADMIN']).optional() }).parse(req.query);
    const where: Prisma.UserWhereInput = { deletedAt: null, ...(q.role ? { role: q.role } : {}) };
    if (q.q) where.OR = [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }, { mobile: { contains: q.q } }];
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: { id: true, name: true, email: true, mobile: true, role: true, isActive: true, createdAt: true, _count: { select: { orders: true } } },
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ users, total });
  }),
);

adminRouter.patch(
  '/users/:id/active',
  ah(async (req, res) => {
    const id = uuid(req.params.id);
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    if (id === currentUser(req).id) throw badRequest('You cannot disable your own account');
    const user = await prisma.user.update({ where: { id }, data: { isActive }, select: { id: true, isActive: true } });
    if (!isActive) await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(req, isActive ? 'user.enable' : 'user.disable', 'User', id);
    res.json({ user });
  }),
);

adminRouter.get(
  '/orders',
  ah(async (req, res) => {
    const q = page.extend({ status: z.string().max(30).optional() }).parse(req.query);
    const where: Prisma.PrintOrderWhereInput = {};
    if (q.status) where.status = z.enum(['DRAFT', 'PENDING_PAYMENT', 'PAID', 'PRINTING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED', 'REFUNDED']).parse(q.status);
    if (q.q) where.OR = [{ orderNumber: { contains: q.q, mode: 'insensitive' } }, { customer: { name: { contains: q.q, mode: 'insensitive' } } }];
    const [orders, total] = await Promise.all([
      prisma.printOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { shop: { select: { name: true } }, customer: { select: { name: true, mobile: true } } },
      }),
      prisma.printOrder.count({ where }),
    ]);
    res.json({ orders, total });
  }),
);

adminRouter.get(
  '/payments',
  ah(async (req, res) => {
    const q = page.extend({ status: z.enum(['CREATED', 'PAID', 'FAILED', 'REFUNDED']).optional() }).parse(req.query);
    const where: Prisma.PaymentWhereInput = q.status ? { status: q.status } : {};
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { order: { select: { orderNumber: true, shop: { select: { name: true } }, customer: { select: { name: true } } } }, refunds: true },
      }),
      prisma.payment.count({ where }),
    ]);
    res.json({ payments, total });
  }),
);

adminRouter.get(
  '/refunds',
  ah(async (_req, res) => {
    const refunds = await prisma.refund.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { order: { select: { orderNumber: true, total: true } }, initiatedBy: { select: { name: true, role: true } } },
    });
    res.json({ refunds });
  }),
);

adminRouter.post(
  '/refunds',
  ah(async (req, res) => {
    const body = z.object({ orderId: z.string().uuid(), amount: z.number().int().positive().optional(), reason: z.string().trim().min(3).max(300) }).parse(req.body);
    const refund = await initiateRefund(body.orderId, body.amount ?? null, body.reason, currentUser(req).id);
    await audit(req, 'refund.create', 'PrintOrder', body.orderId, { amount: refund.amount, reason: body.reason });
    res.status(201).json({ refund });
  }),
);

adminRouter.get(
  '/settings',
  ah(async (_req, res) => {
    res.json({ commissionPercent: await commissionPercent() });
  }),
);

adminRouter.put(
  '/settings/commission',
  ah(async (req, res) => {
    const { commissionPercent: value } = z.object({ commissionPercent: z.number().min(0).max(50) }).parse(req.body);
    const before = await commissionPercent();
    await prisma.platformSetting.upsert({ where: { key: 'commissionPercent' }, create: { key: 'commissionPercent', value }, update: { value } });
    await audit(req, 'settings.commission', 'PlatformSetting', 'commissionPercent', { from: before, to: value });
    res.json({ commissionPercent: value });
  }),
);

/** Simple rule-based fraud signals for manual review. */
adminRouter.get(
  '/fraud',
  ah(async (_req, res) => {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const failed = await prisma.payment.groupBy({
      by: ['orderId'],
      where: { status: 'FAILED', createdAt: { gte: since } },
      _count: true,
    });
    const orderIds = failed.map((f) => f.orderId);
    const failOrders = await prisma.printOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, customerId: true } });
    const perCustomer = new Map<string, number>();
    for (const f of failed) {
      const cid = failOrders.find((o) => o.id === f.orderId)?.customerId;
      if (cid) perCustomer.set(cid, (perCustomer.get(cid) ?? 0) + f._count);
    }
    const flaggedIds = [...perCustomer.entries()].filter(([, n]) => n >= 3);
    const failedUsers = await prisma.user.findMany({ where: { id: { in: flaggedIds.map(([id]) => id) } }, select: { id: true, name: true, mobile: true, email: true } });

    const avg = await prisma.printOrder.aggregate({ where: { status: { notIn: ['DRAFT', 'PENDING_PAYMENT'] } }, _avg: { total: true } });
    const threshold = Math.max(500_000, Math.round((avg._avg.total ?? 0) * 5)); // ≥ ₹5,000 or 5× average
    const unusual = await prisma.printOrder.findMany({
      where: { total: { gte: threshold }, createdAt: { gte: since } },
      select: { id: true, orderNumber: true, total: true, status: true, customer: { select: { name: true } }, shop: { select: { name: true } } },
      take: 50,
    });

    // Possible duplicates: several accounts sharing a delivery phone number.
    const dupes = await prisma.$queryRaw<{ mobile: string; accounts: bigint }[]>`
      SELECT d."mobile", COUNT(DISTINCT o."customerId") AS accounts
      FROM "Delivery" d JOIN "PrintOrder" o ON o."id" = d."orderId"
      GROUP BY d."mobile" HAVING COUNT(DISTINCT o."customerId") > 1 LIMIT 50`;

    res.json({
      multipleFailedPayments: failedUsers.map((u) => ({ ...u, failedCount: perCustomer.get(u.id) ?? 0 })),
      unusualOrders: { threshold, orders: unusual },
      duplicateAccounts: dupes.map((d) => ({ mobile: d.mobile, accounts: Number(d.accounts) })),
    });
  }),
);

adminRouter.get(
  '/analytics',
  ah(async (_req, res) => {
    const paidStatuses = { notIn: ['DRAFT', 'PENDING_PAYMENT', 'CANCELLED', 'REFUNDED'] as ('DRAFT' | 'PENDING_PAYMENT' | 'CANCELLED' | 'REFUNDED')[] };
    const [users, shops, pendingShops, gmv, refunds, byStatus] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.shop.count({ where: { status: 'APPROVED', deletedAt: null } }),
      prisma.shop.count({ where: { status: 'PENDING', deletedAt: null } }),
      prisma.printOrder.aggregate({ where: { status: paidStatuses }, _sum: { total: true, commissionAmount: true }, _count: true }),
      prisma.refund.aggregate({ where: { status: 'PROCESSED' }, _sum: { amount: true } }),
      prisma.printOrder.groupBy({ by: ['status'], _count: true }),
    ]);
    res.json({
      users,
      shops,
      pendingShops,
      paidOrders: gmv._count,
      gmv: gmv._sum.total ?? 0,
      commission: gmv._sum.commissionAmount ?? 0,
      refunded: refunds._sum.amount ?? 0,
      byStatus: byStatus.map((b) => ({ status: b.status, count: b._count })),
    });
  }),
);

adminRouter.get(
  '/audit-logs',
  ah(async (_req, res) => {
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { actor: { select: { name: true } } } });
    res.json({ logs });
  }),
);
