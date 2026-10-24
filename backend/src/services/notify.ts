import type { NotificationChannel } from '@prisma/client';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { formatINR } from '../lib/money';

/** SMS provider interface; swap ConsoleSms for MSG91/Twilio/etc. later. */
export interface SmsProvider {
  send(mobile: string, text: string): Promise<void>;
}

class ConsoleSms implements SmsProvider {
  async send(mobile: string, text: string) {
    logger.info({ mobile }, `[SMS] ${text}`);
  }
}

export const sms: SmsProvider = new ConsoleSms();

export function whatsappLink(mobile: string, text: string): string {
  const digits = mobile.replace(/\D/g, '');
  const withCc = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCc}?text=${encodeURIComponent(text)}`;
}

interface NotifyArgs {
  userId?: string | null;
  orderId?: string;
  channel: NotificationChannel;
  recipient: string;
  message: string;
  link?: string;
}

export async function recordNotification(args: NotifyArgs) {
  return prisma.notification.create({
    data: {
      userId: args.userId ?? null,
      orderId: args.orderId,
      channel: args.channel,
      recipient: args.recipient,
      message: args.message,
      link: args.link,
      // Deep links are "sent" when the user taps them; API channels would update this.
      status: args.channel === 'WHATSAPP_LINK' || args.channel === 'IN_APP' ? 'SENT' : 'PENDING',
    },
  });
}

export function newOrderShopMessage(o: { orderNumber: string; total: number; fulfillment: string; customerName: string }) {
  return `New PrintPoint order ${o.orderNumber} from ${o.customerName}. Amount ${formatINR(o.total)} (paid). ${
    o.fulfillment === 'DELIVERY' ? 'Local delivery' : 'Store pickup'
  }. Open your dashboard to start printing.`;
}
