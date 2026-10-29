import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from '@/components/ui';
import NotFound from '../NotFound';


// Placeholder legal copy: have it reviewed by a lawyer before launch.
const PAGES: Record<string, { title: string; body: ReactNode }> = {
  about: {
    title: 'About PrintPoint',
    body: (
      <>
        <p>PrintPoint is a xerox and print shop in Chennai. Send us your documents online, see the exact price, pay once the shop accepts and collect your prints with a pickup code.</p>
        <p>Shop owners get a live desk to accept or decline requests, open files securely and keep customers updated.</p>
      </>
    ),
  },
  contact: {
    title: 'Contact us',
    body: (
      <>
        <p>Email: support@printpoint.example</p>
        <p>WhatsApp / Phone: +91 90000 00000 (10 AM – 7 PM, Mon–Sat)</p>
        <p>For an order issue, please include your order number (e.g. PP-2026-000123).</p>
      </>
    ),
  },
  privacy: {
    title: 'Privacy policy',
    body: (
      <>
        <p>We collect your name, mobile number, email and the documents you upload solely to fulfil print orders.</p>
        <p>Uploaded files are stored privately with random names, are visible only to you, the shop you ordered from and PrintPoint administrators, and are deleted automatically 24 hours after your order is completed or cancelled.</p>
        <p>Payments are processed by Razorpay. We never see or store your card, UPI PIN or bank credentials.</p>
      </>
    ),
  },
  terms: {
    title: 'Terms of service',
    body: (
      <>
        <p>You must have the right to print any document you upload. Shops may refuse jobs that infringe copyright or are unlawful.</p>
        <p>Prices are set by each shop and shown before payment. The price you pay is locked at checkout.</p>
        <p>Pickup orders must be collected with the pickup OTP within 7 days.</p>
      </>
    ),
  },
  'refund-policy': {
    title: 'Refund policy',
    body: (
      <>
        <p>You can cancel for a full refund until the shop starts printing.</p>
        <p>If a shop cancels your order, you receive a full refund automatically.</p>
        <p>For print-quality issues, contact the shop or PrintPoint support within 48 hours. Refunds go back to your original payment method in 5–7 working days.</p>
        <p>If money was deducted but the order shows unpaid, it is confirmed automatically or refunded by Razorpay.</p>
      </>
    ),
  },
};

export default function InfoPage() {
  const { page } = useParams();
  const p = page ? PAGES[page] : undefined;
  if (!p) return <NotFound />;
  return (
    <Card className="prose mx-auto max-w-2xl space-y-3">
      <h1 className="display misreg text-[2.25rem]">{p.title}</h1>
      <div className="space-y-3 text-ink">{p.body}</div>
    </Card>
  );
}
