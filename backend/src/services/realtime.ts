import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import { corsOrigins } from '../config/env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { verifyAccessToken } from '../lib/tokens';
import type { AuthUser } from '../types/express';

/**
 * Rooms:
 *  - user:<id>    a customer's own orders
 *  - shop:<id>    an owner's incoming requests (joined only after an ownership check)
 *  - queue:<id>   public queue numbers for a shop (anyone may watch)
 *
 * Events carry only ids and statuses; clients refetch details over HTTP,
 * so the normal access checks still decide what each person can see.
 */
let io: Server | null = null;

const uuid = z.string().uuid();

export function attachRealtime(server: HttpServer) {
  io = new Server(server, {
    path: '/socket.io',
    cors: { origin: corsOrigins, credentials: true },
    serveClient: false,
  });

  io.on('connection', (socket: Socket) => {
    let user: AuthUser | null = null;
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token === 'string' && token) {
      try {
        user = verifyAccessToken(token);
      } catch {
        user = null; // expired token: still allowed to watch public queues
      }
    }

    if (user) void socket.join(`user:${user.id}`);
    if (user && (user.role === 'SHOP_OWNER' || user.role === 'ADMIN')) {
      const owner = user;
      void prisma.shop
        .findMany({ where: { ownerId: owner.id, deletedAt: null }, select: { id: true } })
        .then((shops) => shops.forEach((s) => void socket.join(`shop:${s.id}`)))
        .catch((err) => logger.error({ err }, 'socket shop join failed'));
    }

    socket.on('queue:watch', (shopId: unknown) => {
      for (const room of socket.rooms) if (room.startsWith('queue:')) void socket.leave(room);
      const parsed = uuid.safeParse(shopId);
      if (parsed.success) void socket.join(`queue:${parsed.data}`);
    });
  });

  return io;
}

export interface OrderChange {
  id: string;
  status: string;
  customerId: string;
  shopId: string;
}

/** Tells the customer, the shop and the shop's public queue that an order changed. */
export function emitOrderChanged(order: OrderChange, kind: 'created' | 'updated' = 'updated') {
  if (!io) return;
  const payload = { orderId: order.id, status: order.status, kind };
  io.to(`user:${order.customerId}`).emit('order:changed', payload);
  io.to(`shop:${order.shopId}`).emit('order:changed', payload);
  io.to(`queue:${order.shopId}`).emit('queue:changed', { shopId: order.shopId });
}

/** Re-reads an order and broadcasts it; never throws (realtime is best-effort). */
export async function broadcastOrder(orderId: string, kind: 'created' | 'updated' = 'updated') {
  if (!io) return;
  try {
    const o = await prisma.printOrder.findUnique({ where: { id: orderId }, select: { id: true, status: true, customerId: true, shopId: true } });
    if (o) emitOrderChanged(o, kind);
  } catch (err) {
    logger.error({ err }, 'broadcastOrder failed');
  }
}

export function emitShopChanged(shopId: string) {
  io?.to(`queue:${shopId}`).emit('queue:changed', { shopId });
  io?.to(`shop:${shopId}`).emit('shop:changed', { shopId });
}

/** Newly registered shops: let already-connected owner sockets join their room. */
export function joinOwnerToShop(ownerId: string, shopId: string) {
  io?.in(`user:${ownerId}`).socketsJoin(`shop:${shopId}`);
}
