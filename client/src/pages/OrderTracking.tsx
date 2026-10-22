import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { saveCart } from '@/lib/cart';
import { dateTime, rupees } from '@/lib/format';
import type { Order } from '@/lib/types';
import { StatusBadge, StatusTimeline } from '@/components/StatusTimeline';
import { Alert, Button, ButtonLink, Card, ErrorState, Loading, Textarea } from '@/components/ui';

export function orderToCart(o: Order) {
  saveCart({
    shopId: o.shopId,
    shopName: o.shop.name,
    draftId: o.id,
    fulfillment: o.fulfillment,
    couponCode: '',
    specialInstructions: o.specialInstructions ?? '',
    delivery: o.delivery ? { name: o.delivery.name, mobile: o.delivery.mobile, address: o.delivery.address, landmark: o.delivery.landmark, pincode: o.delivery.pincode, preferredTime: o.delivery.preferredTime } : null,
    items: o.items.map((i) => ({
      fileId: i.fileId,
      fileName: i.fileName,
      mimeType: i.file?.mimeType ?? 'application/pdf',
      sizeBytes: i.file?.sizeBytes ?? 0,
      pageCount: i.totalPages,
      pagesOverride: i.totalPages,
      settings: {
        color: i.color, paperSize: i.paperSize, sides: i.sides, paperQuality: i.paperQuality, copies: i.copies, pageRange: i.pageRange ?? '',
        orientation: i.orientation, fitMode: i.fitMode, binding: i.binding, lamination: i.lamination,
      },
    })),
  });
}

export default function OrderTracking() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const q = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get<{ order: Order; notifyShopLink: string | null }>(`/orders/${id}`),
    // Poll while the shop is working on it.
    refetchInterval: (query) => (['PAID', 'PRINTING', 'READY', 'OUT_FOR_DELIVERY'].includes(query.state.data?.order.status ?? '') ? 20_000 : false),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['order', id] });

  const cancel = useMutation({ mutationFn: () => api.post(`/orders/${id}/cancel`, { reason: 'Cancelled by customer' }), onSuccess: refresh });
  const reorder = useMutation({
    mutationFn: () => api.post<{ order: Order }>(`/orders/${id}/reorder`),
    onSuccess: ({ order }) => {
      orderToCart(order);
      navigate('/cart');
    },
  });
  const review = useMutation({ mutationFn: () => api.post(`/orders/${id}/review`, { rating, comment: comment || undefined }), onSuccess: refresh });
  const invoice = useMutation({ mutationFn: () => api.download(`/orders/${id}/invoice`, 'invoice.pdf') });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const { order, notifyShopLink } = q.data!;
  const paid = !!order.orderNumber;
  const anyError = cancel.error ?? reorder.error ?? review.error ?? invoice.error;

  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold">{order.orderNumber ?? 'Unpaid order'}</h1>
              <p className="text-sm text-muted">{order.shop.name} · placed {dateTime(order.createdAt)}</p>
            </div>
            <StatusBadge status={order.status} />
          </div>
          {order.fulfillment === 'PICKUP' && order.pickupOtp && ['PAID', 'PRINTING', 'READY'].includes(order.status) && (
            <div className="mt-4 rounded-card bg-active p-4 text-center">
              <p className="text-sm">Pickup OTP — show at the counter</p>
              <p className="text-3xl font-bold tracking-[0.3em]">{order.pickupOtp}</p>
            </div>
          )}
          {order.status === 'READY' && <div className="mt-3"><Alert tone="green">Your prints are ready! Collect them from {order.shop.address}.</Alert></div>}
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">Status</h2>
          <StatusTimeline order={order} />
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Files & options</h2>
          <ul className="divide-y divide-line">
            {order.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{i.fileName}</p>
                  <p className="text-muted">
                    {i.printedPages} pages{i.pageRange ? ` (${i.pageRange})` : ''} × {i.copies} · {i.color === 'COLOR' ? 'Colour' : 'B/W'} · {i.paperSize} · {i.sides === 'DOUBLE' ? 'Double' : 'Single'}-sided
                    {i.binding !== 'NONE' && ` · ${i.binding.toLowerCase()} binding`}
                    {i.lamination !== 'NONE' && ` · lamination`}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums">{rupees(i.lineTotal)}</span>
              </li>
            ))}
          </ul>
          {order.specialInstructions && <p className="mt-3 text-sm text-muted">Note: {order.specialInstructions}</p>}
        </Card>

        {order.status === 'COMPLETED' && !order.review && (
          <Card className="space-y-3">
            <h2 className="font-semibold">Rate this shop</h2>
            <div className="inline-flex gap-1 rounded-control bg-active p-1" role="radiogroup" aria-label="Rating out of 5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} role="radio" aria-checked={rating === n} onClick={() => setRating(n)} className={`num h-9 w-10 rounded-[5px] text-sm ${rating === n ? 'bg-surface font-semibold' : 'text-muted hover:text-ink'}`}>
                  {n}
                </button>
              ))}
            </div>
            <Textarea label="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
            <Button variant="primary" loading={review.isPending} onClick={() => review.mutate()}>Submit review</Button>
          </Card>
        )}
      </div>

      <aside className="space-y-5">
        <Card className="space-y-2 text-sm">
          <h2 className="font-semibold">Payment</h2>
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{rupees(order.subtotal)}</span></div>
          {order.deliveryFee > 0 && <div className="flex justify-between"><span>Delivery</span><span className="tabular-nums">{rupees(order.deliveryFee)}</span></div>}
          {order.discount > 0 && <div className="flex justify-between text-positive"><span>Discount</span><span className="tabular-nums">− {rupees(order.discount)}</span></div>}
          {order.tax > 0 && <div className="flex justify-between"><span>Tax</span><span className="tabular-nums">{rupees(order.tax)}</span></div>}
          <div className="flex justify-between border-t border-line pt-2 font-semibold"><span>Total</span><span className="tabular-nums">{rupees(order.total)}</span></div>
          {order.refunds?.map((r) => (
            <p key={r.id} className="text-xs text-muted">Refund {rupees(r.amount)} · {r.status.toLowerCase()}</p>
          ))}
        </Card>
        {order.delivery && (
          <Card className="text-sm">
            <h2 className="mb-1 font-semibold">Delivery to</h2>
            <p>{order.delivery.name} · {order.delivery.mobile}</p>
            <p className="text-muted">{order.delivery.address}{order.delivery.landmark ? `, near ${order.delivery.landmark}` : ''}</p>
            {order.delivery.partnerName && <p className="mt-1">Delivery by {order.delivery.partnerName}</p>}
          </Card>
        )}
        <Card className="flex flex-col gap-2">
          {anyError && <ErrorState error={anyError} />}
          {order.status === 'PENDING_PAYMENT' && <ButtonLink variant="primary" to={`/payment/failed/${order.id}?reason=${encodeURIComponent('Payment pending')}`}>Pay now</ButtonLink>}
          {order.status === 'DRAFT' && (
            <Button variant="primary" onClick={() => { orderToCart(order); navigate('/cart'); }}>Continue draft</Button>
          )}
          {notifyShopLink && (
            <a href={notifyShopLink} target="_blank" rel="noreferrer noopener" className="rounded-control bg-primary px-4 py-2.5 text-center text-sm font-medium text-on-primary hover:opacity-90">
              Message shop on WhatsApp
            </a>
          )}
          {paid && <Button variant="secondary" loading={invoice.isPending} onClick={() => invoice.mutate()}>Download invoice (PDF)</Button>}
          {paid && <Button variant="secondary" loading={reorder.isPending} onClick={() => reorder.mutate()}>Reorder</Button>}
          {['DRAFT', 'PENDING_PAYMENT', 'PAID'].includes(order.status) && (
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={() => {
                if (confirm(order.status === 'PAID' ? 'Cancel and get a full refund?' : 'Cancel this order?')) cancel.mutate();
              }}
            >
              {order.status === 'PAID' ? 'Cancel & refund' : 'Cancel order'}
            </Button>
          )}
          {order.shop.mobile && <a href={`tel:${order.shop.mobile}`} className="text-center text-sm text-ink underline">Call shop</a>}
        </Card>
      </aside>
    </div>
  );
}
