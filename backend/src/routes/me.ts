import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ah, badRequest, conflict, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { authenticate, currentUser } from '../middleware/auth';

export const meRouter = Router();
meRouter.use(authenticate);

const addressSchema = z.object({
  label: z.string().trim().min(1).max(30).default('Home'),
  name: z.string().trim().min(2).max(80),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile'),
  line1: z.string().trim().min(5).max(300),
  landmark: z.string().trim().max(120).optional().nullable(),
  area: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(60),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit pincode'),
  isDefault: z.boolean().default(false),
});

meRouter.get(
  '/addresses',
  ah(async (req, res) => {
    const addresses = await prisma.customerAddress.findMany({
      where: { userId: currentUser(req).id, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ addresses });
  }),
);

meRouter.post(
  '/addresses',
  ah(async (req, res) => {
    const userId = currentUser(req).id;
    const data = addressSchema.parse(req.body);
    const address = await prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.customerAddress.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.customerAddress.create({ data: { ...data, userId } });
    });
    res.status(201).json({ address });
  }),
);

meRouter.put(
  '/addresses/:id',
  ah(async (req, res) => {
    const userId = currentUser(req).id;
    const id = z.string().uuid().parse(req.params.id);
    const data = addressSchema.parse(req.body);
    const existing = await prisma.customerAddress.findFirst({ where: { id, userId, deletedAt: null } });
    if (!existing) throw notFound('Address not found');
    const address = await prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.customerAddress.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.customerAddress.update({ where: { id }, data });
    });
    res.json({ address });
  }),
);

meRouter.delete(
  '/addresses/:id',
  ah(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const r = await prisma.customerAddress.updateMany({ where: { id, userId: currentUser(req).id, deletedAt: null }, data: { deletedAt: new Date() } });
    if (r.count === 0) throw notFound('Address not found');
    res.json({ ok: true });
  }),
);

meRouter.put(
  '/profile',
  ah(async (req, res) => {
    const userId = currentUser(req).id;
    const body = z
      .object({
        name: z.string().trim().min(2).max(80),
        email: z.string().trim().toLowerCase().email().optional().nullable(),
        currentPassword: z.string().max(128).optional(),
        newPassword: z.string().min(8).max(128).optional(),
      })
      .parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (body.email && body.email !== user.email) {
      const taken = await prisma.user.findUnique({ where: { email: body.email } });
      if (taken) throw conflict('This email is already used by another account');
    }
    let passwordHash: string | undefined;
    if (body.newPassword) {
      if (user.passwordHash && !(await bcrypt.compare(body.currentPassword ?? '', user.passwordHash))) throw badRequest('Current password is incorrect');
      passwordHash = await bcrypt.hash(body.newPassword, 12);
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { name: body.name, email: body.email ?? user.email, ...(passwordHash ? { passwordHash } : {}) },
      select: { id: true, name: true, email: true, mobile: true, role: true },
    });
    res.json({ user: updated });
  }),
);

/** Refunds act as the customer's "wallet" view: money returned to source. */
meRouter.get(
  '/refunds',
  ah(async (req, res) => {
    const refunds = await prisma.refund.findMany({
      where: { order: { customerId: currentUser(req).id } },
      orderBy: { createdAt: 'desc' },
      include: { order: { select: { id: true, orderNumber: true } } },
    });
    const processed = refunds.filter((r) => r.status === 'PROCESSED').reduce((s, r) => s + r.amount, 0);
    const pending = refunds.filter((r) => r.status === 'PENDING').reduce((s, r) => s + r.amount, 0);
    res.json({ refunds, totals: { processed, pending } });
  }),
);
