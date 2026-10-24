import type { FulfillmentType, OrderStatus, Prisma, PricingRule } from '@prisma/client';
import { z } from 'zod';
import { env } from '../config/env';
import { badRequest, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { calculateQuote, PricingError, ruleSnapshot, type CouponInput, type Quote } from './pricing';

type Tx = Prisma.TransactionClient;

export const printSettingsSchema = z.object({
  color: z.enum(['BW', 'COLOR']).default('BW'),
  paperSize: z.enum(['A4', 'A3', 'LEGAL']).default('A4'),
  sides: z.enum(['SINGLE', 'DOUBLE']).default('SINGLE'),
  paperQuality: z.enum(['NORMAL_70', 'BOND_80', 'GLOSSY']).default('NORMAL_70'),
  copies: z.coerce.number().int().min(1).max(500).default(1),
  pageRange: z.string().trim().max(200).optional().nullable(),
  orientation: z.enum(['PORTRAIT', 'LANDSCAPE']).default('PORTRAIT'),
  fitMode: z.enum(['FIT', 'ACTUAL']).default('FIT'),
  binding: z.enum(['NONE', 'SPIRAL', 'SOFT', 'HARD']).default('NONE'),
  lamination: z.enum(['NONE', 'SINGLE', 'DOUBLE']).default('NONE'),
});

export const quoteInputSchema = z.object({
  shopId: z.string().uuid(),
  fulfillment: z.enum(['PICKUP', 'DELIVERY']).default('PICKUP'),
  couponCode: z.string().trim().toUpperCase().max(30).optional().nullable(),
  items: z
    .array(
      z.object({
        fileId: z.string().uuid(),
        // Only used when the server could not read the page count (e.g. some DOCX files)
        pagesOverride: z.coerce.number().int().min(1).max(2000).optional(),
        settings: printSettingsSchema,
      }),
    )
    .min(1, 'Add at least one file')
    .max(20),
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;

export async function getActiveRule(shopId: string, tx: Tx = prisma): Promise<PricingRule> {
  const rule = await tx.pricingRule.findFirst({ where: { shopId, isActive: true }, orderBy: { updatedAt: 'desc' } });
  if (!rule) throw badRequest('This shop has not published prices yet');
  return rule;
}

async function loadCoupon(code: string | null | undefined, shopId: string): Promise<(CouponInput & { id: string }) | null> {
  if (!code) return null;
  const now = new Date();
  const c = await prisma.coupon.findFirst({
    where: {
      code,
      isActive: true,
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gte: now } }],
      AND: [{ OR: [{ shopId: null }, { shopId }] }],
    },
  });
  if (!c) throw badRequest('Coupon is invalid or expired');
  if (c.usageLimit != null && c.usedCount >= c.usageLimit) throw badRequest('Coupon usage limit reached');
  return { id: c.id, code: c.code, discountType: c.discountType, value: c.value, maxDiscount: c.maxDiscount, minOrder: c.minOrder };
}

export interface BuiltQuote {
  quote: Quote;
  rule: PricingRule;
  couponId: string | null;
  files: Map<string, { id: string; originalName: string; totalPages: number }>;
}

export async function buildQuote(userId: string, input: QuoteInput): Promise<BuiltQuote> {
  const shop = await prisma.shop.findFirst({ where: { id: input.shopId, status: 'APPROVED', deletedAt: null } });
  if (!shop) throw notFound('Shop not found or not accepting orders');
  if (input.fulfillment === 'DELIVERY' && !shop.deliveryAvailable) throw badRequest('This shop does not offer delivery');

  const rule = await getActiveRule(shop.id);
  const ids = [...new Set(input.items.map((i) => i.fileId))];
  const rows = await prisma.uploadedFile.findMany({ where: { id: { in: ids }, ownerId: userId, deletedAt: null } });
  if (rows.length !== ids.length) throw badRequest('One or more files were not found. Please upload them again.');

  const files = new Map<string, { id: string; originalName: string; totalPages: number }>();
  const quoteItems = input.items.map((item) => {
    const f = rows.find((r) => r.id === item.fileId)!;
    const totalPages = f.pageCount ?? item.pagesOverride;
    if (!totalPages) throw badRequest(`Enter the page count for ${f.originalName}`);
    files.set(f.id, { id: f.id, originalName: f.originalName, totalPages });
    return { key: f.id, fileName: f.originalName, totalPages, settings: item.settings };
  });

  const coupon = await loadCoupon(input.couponCode, shop.id);
  try {
    const quote = calculateQuote(ruleSnapshot(rule), quoteItems, input.fulfillment as FulfillmentType, coupon);
    return { quote, rule, couponId: quote.discount > 0 && coupon ? coupon.id : null, files };
  } catch (e) {
    if (e instanceof PricingError) throw badRequest(e.message);
    throw e;
  }
}

export async function addEvent(tx: Tx, orderId: string, status: OrderStatus, actorId?: string | null, note?: string) {
  await tx.orderEvent.create({ data: { orderId, status, actorId: actorId ?? null, note } });
}

export async function nextOrderNumber(tx: Tx, date = new Date()): Promise<string> {
  const year = date.getFullYear();
  const counter = await tx.orderCounter.upsert({
    where: { year },
    create: { year, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `PP-${year}-${String(counter.value).padStart(6, '0')}`;
}

export async function commissionPercent(): Promise<number> {
  const s = await prisma.platformSetting.findUnique({ where: { key: 'commissionPercent' } });
  const v = typeof s?.value === 'number' ? s.value : env.DEFAULT_COMMISSION_PERCENT;
  return v;
}

/** Allowed shop-side status transitions. */
export const SHOP_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PAID: ['PRINTING', 'CANCELLED'],
  PRINTING: ['READY', 'OUT_FOR_DELIVERY', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['COMPLETED'],
};

export const orderDetailInclude = {
  shop: { select: { id: true, name: true, address: true, area: true, city: true, mobile: true, mapsUrl: true, estimatedPickupMins: true } },
  customer: { select: { id: true, name: true, mobile: true, email: true } },
  items: { include: { file: { select: { id: true, deletedAt: true, mimeType: true, sizeBytes: true } } } },
  payments: { orderBy: { createdAt: 'desc' } },
  refunds: { orderBy: { createdAt: 'desc' } },
  delivery: true,
  review: true,
  events: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.PrintOrderInclude;
