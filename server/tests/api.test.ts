import crypto from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { signAccessToken } from '../src/lib/tokens';
import { verifyCheckoutSignature, verifyWebhookSignature } from '../src/services/razorpay';
import { detectKind } from '../src/services/fileInspect';

// These tests exercise routing, auth, validation and signature logic without a database.
const app = createApp();

describe('API basics', () => {
  it('GET /health', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('unknown route returns 404 JSON', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects invalid login payload with 400', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ identifier: 'a' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid mobile for OTP', async () => {
    const res = await request(app).post('/api/v1/auth/otp/request').send({ mobile: '12345' });
    expect(res.status).toBe(400);
  });

  it('protects order routes', async () => {
    const res = await request(app).get('/api/v1/orders');
    expect(res.status).toBe(401);
  });

  it('enforces roles on admin routes', async () => {
    const token = signAccessToken({ id: crypto.randomUUID(), role: 'CUSTOMER' });
    const res = await request(app).get('/api/v1/admin/shops').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('rejects forged access tokens', async () => {
    const res = await request(app).get('/api/v1/orders').set('Authorization', 'Bearer abc.def.ghi');
    expect(res.status).toBe(401);
  });

  it('rejects malformed JSON', async () => {
    const res = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
  });
});

describe('Razorpay signatures', () => {
  it('verifies checkout signature', () => {
    const sig = crypto.createHmac('sha256', 'test_key_secret').update('order_1|pay_1').digest('hex');
    expect(verifyCheckoutSignature('order_1', 'pay_1', sig)).toBe(true);
    expect(verifyCheckoutSignature('order_1', 'pay_2', sig)).toBe(false);
  });

  it('webhook with bad signature is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/payments/webhook')
      .set('X-Razorpay-Signature', 'deadbeef')
      .send({ event: 'payment.captured', payload: {} });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_SIGNATURE');
  });

  it('verifies webhook signature over raw body', () => {
    const body = Buffer.from(JSON.stringify({ event: 'payment.failed' }));
    const sig = crypto.createHmac('sha256', 'test_webhook_secret').update(body).digest('hex');
    expect(verifyWebhookSignature(body, sig)).toBe(true);
    expect(verifyWebhookSignature(Buffer.from('{}'), sig)).toBe(false);
  });
});

describe('upload type detection', () => {
  it('detects real file types by magic bytes', () => {
    expect(detectKind(Buffer.from('%PDF-1.7 ...'), 'a.pdf')).toBe('pdf');
    expect(detectKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'a.jpg')).toBe('jpg');
    expect(detectKind(Buffer.from('MZ fake exe'), 'evil.pdf')).toBeNull();
  });
});
