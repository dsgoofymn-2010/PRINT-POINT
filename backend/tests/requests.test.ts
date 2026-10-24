import crypto from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A tiny in-memory stand-in for Prisma so ownership and pickup rules run without a database.
const db = vi.hoisted(() => ({
  shop: { findFirst: vi.fn(), findMany: vi.fn() },
  printOrder: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  orderEvent: { create: vi.fn() },
  orderItem: { findMany: vi.fn(), findFirst: vi.fn() },
  uploadedFile: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('../src/lib/prisma', () => ({ prisma: db }));

import { createApp } from '../src/app';
import { signAccessToken } from '../src/lib/tokens';
import { signedFileUrl, verifyFileSignature } from '../src/lib/signedUrl';
import { collectWithCode, MAX_PICKUP_ATTEMPTS, maskMobile, toQuoteInput } from '../src/services/requests';
import { calculateQuote, type PriceRule } from '../src/services/pricing';

const app = createApp();
const bearer = (role: 'CUSTOMER' | 'SHOP_OWNER' | 'ADMIN', id: string = crypto.randomUUID()) => `Bearer ${signAccessToken({ id, role })}`;

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
});

describe('request routes: access', () => {
  it('requires sign-in to send or list requests', async () => {
    expect((await request(app).get('/api/v1/requests')).status).toBe(401);
    expect((await request(app).post('/api/v1/requests').send({})).status).toBe(401);
  });

  it('keeps customers out of the owner dashboard', async () => {
    const res = await request(app).get('/api/v1/shop/requests').set('Authorization', bearer('CUSTOMER'));
    expect(res.status).toBe(403);
  });

  it('validates the request body', async () => {
    const res = await request(app)
      .post('/api/v1/requests')
      .set('Authorization', bearer('CUSTOMER'))
      .send({ shopId: crypto.randomUUID(), files: [], options: { color: 'BW', sides: 'SINGLE', copies: 1, binding: 'NONE' } });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/at least one file/);
  });

  it("an owner cannot act on another shop's request", async () => {
    const ownerId = crypto.randomUUID();
    db.printOrder.findFirst.mockResolvedValue(null); // the order belongs to someone else's shop
    const res = await request(app)
      .post(`/api/v1/shop/requests/${crypto.randomUUID()}/accept`)
      .set('Authorization', bearer('SHOP_OWNER', ownerId))
      .send({});
    expect(res.status).toBe(404);
    // The lookup must be scoped to shops owned by the caller.
    expect(db.printOrder.findFirst.mock.calls[0][0].where.shop.ownerId).toBe(ownerId);
    expect(db.printOrder.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a malformed pickup code before touching the order state', async () => {
    const ownerId = crypto.randomUUID();
    db.printOrder.findFirst.mockResolvedValue({ id: 'o1', shop: { id: 'my-shop', estimatedPickupMins: 30 } });
    const res = await request(app)
      .post(`/api/v1/shop/requests/${crypto.randomUUID()}/collect`)
      .set('Authorization', bearer('SHOP_OWNER', ownerId))
      .send({ code: '12ab' });
    expect(res.status).toBe(400);
    expect(db.printOrder.update).not.toHaveBeenCalled();
  });
});

describe('pickup codes', () => {
  const ready = { id: 'o1', status: 'READY', pickupOtp: '482913', pickupAttempts: 0, customerId: 'c', shopId: 's' };

  it('counts wrong attempts', async () => {
    db.printOrder.findUniqueOrThrow.mockResolvedValue(ready);
    await expect(collectWithCode('o1', 'owner', '000000')).rejects.toThrow(/tries left/);
    expect(db.printOrder.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { pickupAttempts: 1 } });
  });

  it('replaces the code after too many wrong attempts', async () => {
    db.printOrder.findUniqueOrThrow.mockResolvedValue({ ...ready, pickupAttempts: MAX_PICKUP_ATTEMPTS - 1 });
    await expect(collectWithCode('o1', 'owner', '000000')).rejects.toThrow(/new code/);
    const data = db.printOrder.update.mock.calls[0][0].data;
    expect(data.pickupAttempts).toBe(0);
    expect(data.pickupOtp).toMatch(/^\d{6}$/);
    expect(data.pickupOtp).not.toBe(ready.pickupOtp);
  });

  it('completes with the right code and clears it (single use)', async () => {
    db.printOrder.findUniqueOrThrow.mockResolvedValue(ready);
    db.printOrder.updateMany.mockResolvedValue({ count: 1 });
    db.orderItem.findMany.mockResolvedValue([]);
    await collectWithCode('o1', 'owner', '482913');
    const call = db.printOrder.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'o1', status: { in: ['READY'] } });
    expect(call.data.status).toBe('COMPLETED');
    expect(call.data.pickupOtp).toBeNull();
  });

  it('refuses to complete an order that is not ready', async () => {
    db.printOrder.findUniqueOrThrow.mockResolvedValue({ ...ready, status: 'PRINTING' });
    await expect(collectWithCode('o1', 'owner', '482913')).rejects.toThrow(/ready/);
  });
});

describe('signed file links', () => {
  it('accepts a fresh link and rejects tampering or expiry', () => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const { url } = signedFileUrl(id, 'inline', now);
    const q = new URL(url, 'http://x').searchParams;
    const exp = Number(q.get('exp'));
    const sig = q.get('sig')!;
    expect(verifyFileSignature(id, exp, 'inline', sig, now)).toBe(true);
    expect(verifyFileSignature(id, exp, 'attachment', sig, now)).toBe(false);
    expect(verifyFileSignature(crypto.randomUUID(), exp, 'inline', sig, now)).toBe(false);
    expect(verifyFileSignature(id, exp, 'inline', sig, (exp + 1) * 1000)).toBe(false);
  });

  it('the public file route refuses unsigned requests', async () => {
    const res = await request(app).get(`/api/v1/files/${crypto.randomUUID()}`);
    expect(res.status).toBe(403);
  });
});

describe('helpers', () => {
  it('masks all but the last 4 digits', () => {
    expect(maskMobile('9876543210')).toBe('••••••3210');
    expect(maskMobile(null)).toBeNull();
  });

  it('chat price lines add up exactly to the total, double-sided rate included', () => {
    const rule: PriceRule = {
      bwSingle: 150, bwDouble: 110, colorSingle: 1000, colorDouble: 850, a3Multiplier: 2, legalMultiplier: 1.2, bondExtra: 0, glossyExtra: 0,
      spiralBinding: 3500, softBinding: 0, hardBinding: 0, laminationSingle: 0, laminationDouble: 0, deliveryFee: 0, freeDeliveryAbove: null,
      minOrderAmount: 0, taxPercent: 5,
    };
    const input = toQuoteInput({
      shopId: crypto.randomUUID(),
      files: [{ fileId: 'a' }, { fileId: 'b' }],
      options: { color: 'BW', sides: 'DOUBLE', copies: 3, binding: 'SPIRAL' },
    });
    const q = calculateQuote(rule, input.items.map((i, n) => ({ key: i.fileId, fileName: `f${n}`, totalPages: n ? 7 : 12, settings: i.settings })), 'PICKUP');
    for (const it of q.items) {
      expect(it.ratePerPage).toBe(110);
      expect(it.printCost).toBe(it.printedPages * it.copies * 110);
      expect(it.lineTotal).toBe(it.printCost + it.bindingCost);
    }
    expect(q.items.reduce((s, i) => s + i.lineTotal, 0) + q.tax).toBe(q.total);
  });
});
