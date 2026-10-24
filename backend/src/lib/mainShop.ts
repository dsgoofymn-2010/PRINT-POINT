import { env } from '../config/env';
import { prisma } from './prisma';

/**
 * This app serves a single shop.
 * It's the shop named by SHOP_SLUG, or else the oldest approved shop.
 */
export async function getMainShopId(): Promise<string | null> {
  const where = { status: 'APPROVED' as const, deletedAt: null, ...(env.SHOP_SLUG ? { slug: env.SHOP_SLUG } : {}) };
  const shop = await prisma.shop.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { id: true } });
  return shop?.id ?? null;
}

/** True once any shop exists, so nobody else can sign up as a shop. */
export async function shopExists(): Promise<boolean> {
  return (await prisma.shop.count({ where: { deletedAt: null } })) > 0;
}
