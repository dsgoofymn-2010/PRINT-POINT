import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { env, razorpayConfigured } from '../config/env';
import { AppError } from '../lib/errors';
import { safeEqual } from '../lib/tokens';

let client: Razorpay | null = null;

export function razorpay(): Razorpay {
  if (!razorpayConfigured) {
    throw new AppError(503, 'Online payments are not configured. Add Razorpay test keys to server/.env.', 'PAYMENTS_DISABLED');
  }
  client ??= new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  return client;
}

/** Checkout signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!env.RAZORPAY_KEY_SECRET) return false;
  const expected = crypto.createHmac('sha256', env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
}

/** Webhook signature = HMAC_SHA256(raw request body, webhook_secret). */
export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}
