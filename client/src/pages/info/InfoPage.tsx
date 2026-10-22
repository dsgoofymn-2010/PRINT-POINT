import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from '@/components/ui';
import NotFound from '../NotFound';

const CREDITS = [
  { title: 'Burkit road t nagar Chennai', by: 'Commons_sibi', licence: 'CC BY-SA 3.0', href: 'https://commons.wikimedia.org/w/index.php?curid=28842787' },
  { title: 'Venkatanarayana road t nagar Chennai', by: 'Commons_sibi', licence: 'CC BY-SA 3.0', href: 'https://commons.wikimedia.org/w/index.php?curid=28842799' },
  { title: 'Diwali Urban Shopping, Thiyagaraja Nagar, Chennai', by: 'Arunsarv', licence: 'CC BY-SA 4.0', href: 'https://commons.wikimedia.org/w/index.php?curid=49593068' },
  { title: 'Sharp MX-7500 photocopier', by: 'Baron Maddock', licence: 'CC BY 4.0', href: 'https://commons.wikimedia.org/w/index.php?curid=127804823' },
  { title: 'Spiralbinderücken (bw)', by: 'Dietmar Rabich', licence: 'CC BY-SA 4.0', href: 'https://commons.wikimedia.org/w/index.php?curid=114638646' },
  { title: 'Highlighter pen, photocopied text', by: "Guido 'random' Alvarez", licence: 'CC BY 2.0', href: 'https://commons.wikimedia.org/w/index.php?curid=6263592' },
  { title: 'Konica Minolta photocopier with an automatic document feeder (video)', by: 'Smuconlaw', licence: 'CC BY-SA 4.0', href: 'https://commons.wikimedia.org/wiki/File:Konica_Minolta_photocopier_with_an_automatic_document_feeder,_School_of_Law,_Singapore_Management_University_-_20140611.webm' },
];

// Placeholder legal copy: have it reviewed by a lawyer before launch.
const PAGES: Record<string, { title: string; body: ReactNode }> = {
  about: {
    title: 'About PrintPoint',
    body: (
      <>
        <p>PrintPoint connects students and office users with neighbourhood xerox and print shops. Upload your documents, see the exact price, pay online and collect your prints without waiting in line.</p>
        <p>Shop owners get a simple dashboard to receive paid orders, download files securely and keep customers updated.</p>
        <h2 id="credits" className="pt-4 text-lg font-semibold text-ink">Picture credits</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {CREDITS.map((c) => (
            <li key={c.href}>
              <a className="underline" href={c.href}>{c.title}</a> by {c.by}, {c.licence}, via Wikimedia Commons
            </li>
          ))}
        </ul>
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
      <h1 className="text-2xl font-bold">{p.title}</h1>
      <div className="space-y-3 text-ink">{p.body}</div>
    </Card>
  );
}
