import { api } from './api';

interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  handler: (r: RazorpaySuccess) => void;
  modal: { ondismiss: () => void; confirm_close: boolean };
  timeout: number;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', cb: (r: { error: { description: string; metadata?: { payment_id?: string } } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (opts: RazorpayOptions) => RazorpayInstance;
  }
}

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Razorpay. Check your internet connection.'));
    document.body.appendChild(s);
  });
}

interface CreateOrderResponse {
  keyId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
}

export type PayResult =
  | { kind: 'success'; orderNumber: string | null }
  /** Money is on hold at Razorpay; the order turns Paid when it is captured. */
  | { kind: 'pending' }
  | { kind: 'failed'; reason: string }
  | { kind: 'cancelled' };

/**
 * Opens Razorpay Standard Checkout for a PrintPoint order. The order only
 * becomes "Paid" after the server verifies the signature.
 */
export async function payForOrder(orderId: string): Promise<PayResult> {
  const [data] = await Promise.all([api.post<CreateOrderResponse>('/payments/create-order', { orderId }), loadScript()]);
  if (!window.Razorpay) throw new Error('Razorpay failed to load');
  const Rzp = window.Razorpay;

  return new Promise<PayResult>((resolve) => {
    let settled = false;
    const done = (r: PayResult) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    const rzp = new Rzp({
      key: data.keyId,
      order_id: data.razorpayOrderId,
      amount: data.amount,
      currency: data.currency,
      name: data.name,
      description: data.description,
      prefill: data.prefill,
      theme: { color: '#1d4ed8' },
      timeout: 600, // seconds; Razorpay closes the form after this
      modal: {
        confirm_close: true,
        ondismiss: () => {
          void api.post('/payments/failed', { razorpayOrderId: data.razorpayOrderId, reason: 'Checkout closed by user' }).catch(() => undefined);
          done({ kind: 'cancelled' });
        },
      },
      handler: (resp) => {
        api
          .post<{ orderNumber?: string | null; pending?: boolean }>('/payments/verify', resp)
          .then((v) => done(v.pending ? { kind: 'pending' } : { kind: 'success', orderNumber: v.orderNumber ?? null }))
          .catch((e: Error) => done({ kind: 'failed', reason: e.message }));
      },
    });
    rzp.on('payment.failed', (r) => {
      void api
        .post('/payments/failed', { razorpayOrderId: data.razorpayOrderId, reason: r.error.description, razorpayPaymentId: r.error.metadata?.payment_id })
        .catch(() => undefined);
      // Razorpay lets the user retry inside the modal, so we only record the failure here.
    });
    rzp.open();
  });
}
