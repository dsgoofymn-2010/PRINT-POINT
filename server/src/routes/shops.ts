import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ah, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { queueInfo, shopIsTakingRequests } from '../services/requests';

export const shopsRouter = Router();

const boolParam = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

const listQuery = z.object({
  city: z.string().trim().max(60).optional(),
  area: z.string().trim().max(60).optional(),
  q: z.string().trim().max(60).optional(),
  openNow: boolParam,
  delivery: boolParam,
  color: boolParam,
  binding: boolParam,
  minRating: z.coerce.number().min(0).max(5).optional(),
});

const publicShopSelect = {
  id: true,
  name: true,
  slug: true,
  address: true,
  area: true,
  city: true,
  pincode: true,
  mobile: true,
  mapsUrl: true,
  openTime: true,
  closeTime: true,
  holidays: true,
  deliveryAvailable: true,
  deliveryRadiusKm: true,
  estimatedPickupMins: true,
  rating: true,
  ratingCount: true,
  acceptingRequests: true,
  status: true,
  services: { select: { type: true, note: true } },
  pricingRules: { where: { isActive: true }, take: 1 },
} satisfies Prisma.ShopSelect;

shopsRouter.get(
  '/',
  ah(async (req, res) => {
    const q = listQuery.parse(req.query);
    const where: Prisma.ShopWhereInput = { status: 'APPROVED', deletedAt: null };
    if (q.city) where.city = { equals: q.city, mode: 'insensitive' };
    if (q.area) where.area = { contains: q.area, mode: 'insensitive' };
    if (q.q) where.OR = [{ name: { contains: q.q, mode: 'insensitive' } }, { area: { contains: q.q, mode: 'insensitive' } }];
    if (q.delivery) where.deliveryAvailable = true;
    if (q.minRating) where.rating = { gte: q.minRating };
    const serviceFilters: Prisma.ShopWhereInput[] = [];
    if (q.color) serviceFilters.push({ services: { some: { type: 'COLOR_PRINT' } } });
    if (q.binding) serviceFilters.push({ services: { some: { type: { in: ['SPIRAL_BINDING', 'SOFT_BINDING', 'HARD_BINDING'] } } } });
    if (serviceFilters.length) where.AND = serviceFilters;

    const shops = await prisma.shop.findMany({ where, select: publicShopSelect, orderBy: [{ rating: 'desc' }, { name: 'asc' }], take: 100 });
    const result = shops
      .map(({ pricingRules, ...s }) => ({
        ...s,
        isOpen: shopIsTakingRequests(s),
        minOrderAmount: pricingRules[0]?.minOrderAmount ?? 0,
        startingPrice: pricingRules[0]?.bwSingle ?? null,
      }))
      .filter((s) => !q.openNow || s.isOpen);
    res.json({ shops: result });
  }),
);

shopsRouter.get(
  '/areas',
  ah(async (_req, res) => {
    const rows = await prisma.shop.findMany({
      where: { status: 'APPROVED', deletedAt: null },
      select: { city: true, area: true },
      distinct: ['city', 'area'],
      orderBy: [{ city: 'asc' }, { area: 'asc' }],
    });
    res.json({ areas: rows });
  }),
);

/** Live queue numbers and prices for the chat side panel. */
shopsRouter.get(
  '/:id/queue',
  ah(async (req, res) => {
    res.json({ queue: await queueInfo(z.string().uuid().parse(req.params.id)) });
  }),
);

shopsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const id = z.string().min(1).max(100).parse(req.params.id);
    const shop = await prisma.shop.findFirst({
      where: { OR: [{ id }, { slug: id }], status: 'APPROVED', deletedAt: null },
      select: {
        ...publicShopSelect,
        reviews: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, rating: true, comment: true, createdAt: true, customer: { select: { name: true } } },
        },
      },
    });
    if (!shop) throw notFound('Shop not found');
    const { pricingRules, ...rest } = shop;
    const rule = pricingRules[0] ?? null;
    res.json({
      shop: {
        ...rest,
        isOpen: shopIsTakingRequests(rest),
        pricing: rule && {
          bwSingle: rule.bwSingle,
          bwDouble: rule.bwDouble,
          colorSingle: rule.colorSingle,
          colorDouble: rule.colorDouble,
          a3Multiplier: rule.a3Multiplier,
          legalMultiplier: rule.legalMultiplier,
          bondExtra: rule.bondExtra,
          glossyExtra: rule.glossyExtra,
          spiralBinding: rule.spiralBinding,
          softBinding: rule.softBinding,
          hardBinding: rule.hardBinding,
          laminationSingle: rule.laminationSingle,
          laminationDouble: rule.laminationDouble,
          deliveryFee: rule.deliveryFee,
          freeDeliveryAbove: rule.freeDeliveryAbove,
          minOrderAmount: rule.minOrderAmount,
          taxPercent: rule.taxPercent,
        },
      },
    });
  }),
);
