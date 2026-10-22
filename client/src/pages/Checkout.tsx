import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toOrderPayload, useCart } from '@/lib/cart';
import { dateTime } from '@/lib/format';
import { payForOrder } from '@/lib/razorpay';
import type { Order, ShopDetail } from '@/lib/types';
import { useQuote } from '@/lib/useQuote';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import { Alert, Button, ButtonLink, Card, EmptyState, ErrorState, Input, PageTitle, Segmented, Select } from '@/components/ui';

interface Address { id: string; label: string; name: string; mobile: string; line1: string; landmark: string | null; area: string; city: string; pincode: string }

const deliverySchema = z.object({
  name: z.string().trim().min(2, 'Enter the receiver name'),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  address: z.string().trim().min(5, 'Enter the full address'),
  landmark: z.string().trim().optional().nullable(),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit pincode'),
  preferredTime: z.string().optional().nullable(),
});

export default function Checkout() {
  const { cart, update, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [placed, setPlaced] = useState<Order | null>(null);

  const shopQ = useQuery({ queryKey: ['shop', cart?.shopId], queryFn: () => api.get<{ shop: ShopDetail }>(`/shops/${cart!.shopId}`), enabled: !!cart });
  const addrQ = useQuery({ queryKey: ['addresses'], queryFn: () => api.get<{ addresses: Address[] }>('/me/addresses') });
  const quote = useQuote(cart);

  if (!cart || cart.items.length === 0) return <EmptyState title="Nothing to check out" action={<ButtonLink variant="primary" to="/shops">Find a shop</ButtonLink>} />;
  const shop = shopQ.data?.shop;
  const d = cart.delivery ?? { name: user?.name ?? '', mobile: user?.mobile ?? '', address: '', landmark: '', pincode: '', preferredTime: '' };
  const setD = (k: keyof typeof d, v: string) => update((c) => (c ? { ...c, delivery: { ...d, [k]: v } } : c));

  const pay = async () => {
    setError(null);
    setErrors({});
    if (cart.fulfillment === 'DELIVERY') {
      const r = deliverySchema.safeParse(d);
      if (!r.success) {
        setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
        return;
      }
    }
    setPaying(true);
    try {
      // Re-use the same order on retries so we never create duplicates.
      const payload = toOrderPayload(cart, false);
      const orderId = placed?.id ?? cart.draftId;
      const { order } = orderId ? await api.put<{ order: Order }>(`/orders/${orderId}`, payload) : await api.post<{ order: Order }>('/orders', payload);
      setPlaced(order);
      update((c) => (c ? { ...c, draftId: order.id } : c));
      const result = await payForOrder(order.id);
      if (result.kind === 'success') {
        clear();
        navigate(`/payment/success/${order.id}`, { replace: true });
      } else if (result.kind === 'failed') {
        navigate(`/payment/failed/${order.id}?reason=${encodeURIComponent(result.reason)}`);
      } else {
        setError('Payment was cancelled. You can try again — you have not been charged.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start payment');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
        <PageTitle title="Checkout" subtitle={cart.shopName} />
        <Card className="space-y-4">
          <Segmented
            label="How do you want your prints?"
            name="fulfillment"
            value={cart.fulfillment}
            onChange={(v) => update((c) => (c ? { ...c, fulfillment: v } : c))}
            options={[{ value: 'PICKUP', label: 'Store pickup' }, ...(shop?.deliveryAvailable ? [{ value: 'DELIVERY' as const, label: 'Local delivery' }] : [])]}
          />
          {cart.fulfillment === 'PICKUP' ? (
            <div className="rounded-control bg-raised p-3 text-sm">
              <p className="font-medium">Collect from</p>
              <p>{shop ? `${shop.name}, ${shop.address}, ${shop.area}` : '…'}</p>
              {shop && <p className="mt-1 text-muted">Estimated ready by {dateTime(new Date(Date.now() + shop.estimatedPickupMins * 60_000).toISOString())}. Show your pickup OTP at the counter.</p>}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {addrQ.data && addrQ.data.addresses.length > 0 && (
                <div className="sm:col-span-2">
                  <Select
                    label="Saved address"
                    value=""
                    onChange={(e) => {
                      const a = addrQ.data.addresses.find((x) => x.id === e.target.value);
                      if (a) update((c) => (c ? { ...c, delivery: { name: a.name, mobile: a.mobile, address: `${a.line1}, ${a.area}, ${a.city}`, landmark: a.landmark ?? '', pincode: a.pincode, preferredTime: d.preferredTime } } : c));
                    }}
                    options={[{ value: '', label: 'Choose a saved address…' }, ...addrQ.data.addresses.map((a) => ({ value: a.id, label: `${a.label}: ${a.line1}` }))]}
                  />
                </div>
              )}
              <Input label="Receiver name" value={d.name} onChange={(e) => setD('name', e.target.value)} error={errors.name} autoComplete="name" />
              <Input label="Mobile number" inputMode="numeric" maxLength={10} value={d.mobile} onChange={(e) => setD('mobile', e.target.value)} error={errors.mobile} autoComplete="tel" />
              <div className="sm:col-span-2">
                <Input label="Address" value={d.address} onChange={(e) => setD('address', e.target.value)} error={errors.address} autoComplete="street-address" />
              </div>
              <Input label="Landmark" value={d.landmark ?? ''} onChange={(e) => setD('landmark', e.target.value)} />
              <Input label="Pincode" inputMode="numeric" maxLength={6} value={d.pincode ?? ''} onChange={(e) => setD('pincode', e.target.value)} error={errors.pincode} autoComplete="postal-code" />
              <Select
                label="Preferred delivery time"
                value={d.preferredTime ?? ''}
                onChange={(e) => setD('preferredTime', e.target.value)}
                options={[{ value: '', label: 'As soon as possible' }, { value: 'Morning (9–12)', label: 'Morning (9–12)' }, { value: 'Afternoon (12–4)', label: 'Afternoon (12–4)' }, { value: 'Evening (4–8)', label: 'Evening (4–8)' }]}
              />
            </div>
          )}
        </Card>
      </div>
      <aside className="lg:col-span-2 lg:pt-14">
        <Card className="space-y-4">
          <h2 className="font-semibold">Order summary</h2>
          <ul className="space-y-1 text-sm">
            {cart.items.map((i) => (
              <li key={i.fileId} className="flex justify-between gap-2">
                <span className="truncate">{i.fileName}</span>
                <span className="shrink-0 text-muted">{i.settings.copies}× {i.settings.color === 'COLOR' ? 'Colour' : 'B/W'} {i.settings.paperSize}</span>
              </li>
            ))}
          </ul>
          {quote.error ? <ErrorState error={quote.error} /> : quote.data && <PriceBreakdown quote={quote.data} compact />}
          {error && <Alert tone="amber">{error}</Alert>}
          <Button variant="primary" size="lg" className="w-full" loading={paying} disabled={!quote.data?.meetsMinimum} onClick={() => void pay()}>
            Pay securely with Razorpay
          </Button>
          <p className="text-center text-xs text-muted">UPI, cards, net banking & wallets. We never see or store your card details.</p>
        </Card>
      </aside>
    </div>
  );
}
