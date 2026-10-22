import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { dateTime, fileSize, rupees } from '@/lib/format';
import type { Order, OrderStatus } from '@/lib/types';
import { StatusBadge, StatusTimeline } from '@/components/StatusTimeline';
import { Alert, Button, Card, ErrorState, Input, Loading } from '@/components/ui';

export default function ShopOrderDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [otp, setOtp] = useState('');
  const [partner, setPartner] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const q = useQuery({ queryKey: ['shop-order', id], queryFn: () => api.get<{ order: Order }>(`/shop/orders/${id}`) });
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['shop-order', id] });
    void qc.invalidateQueries({ queryKey: ['shop-orders'] });
    void qc.invalidateQueries({ queryKey: ['shop-dashboard'] });
  };
  const status = useMutation({
    mutationFn: (body: { status: OrderStatus; pickupOtp?: string; partnerName?: string; note?: string }) => api.patch(`/shop/orders/${id}/status`, body),
    onSuccess: done,
  });
  const refund = useMutation({ mutationFn: () => api.post(`/shop/orders/${id}/refund`, { reason: refundReason }), onSuccess: done });
  const download = useMutation({ mutationFn: (f: { fileId: string; name: string }) => api.download(`/uploads/${f.fileId}/download`, f.name) });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const o = q.data!.order;
  const err = status.error ?? refund.error ?? download.error;

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      <div className="no-print flex items-center justify-between lg:col-span-3">
        <Link to="/shop" className="text-sm text-ink underline">← Back to orders</Link>
        <Button variant="secondary" size="sm" onClick={() => window.print()}>Print job sheet</Button>
      </div>

      {/* Job sheet: this card is what gets printed */}
      <Card className="lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="num text-2xl font-semibold">{o.orderNumber}</h1>
            <p className="text-sm text-muted">Paid {dateTime(o.paidAt)} · {o.fulfillment === 'DELIVERY' ? 'Local delivery' : 'Store pickup'}</p>
          </div>
          <StatusBadge status={o.status} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="text-sm">
            <p className="font-medium">Customer</p>
            <p>{o.customer?.name}</p>
            {o.customer?.mobile && <a className="text-ink underline" href={`tel:${o.customer.mobile}`}>{o.customer.mobile}</a>}
          </div>
          {o.delivery && (
            <div className="text-sm">
              <p className="font-medium">Deliver to</p>
              <p>{o.delivery.name} · {o.delivery.mobile}</p>
              <p>{o.delivery.address}{o.delivery.landmark ? `, near ${o.delivery.landmark}` : ''} {o.delivery.pincode}</p>
              {o.delivery.preferredTime && <p>Preferred: {o.delivery.preferredTime}</p>}
            </div>
          )}
        </div>
        <table className="mt-4 w-full text-left text-sm">
          <thead className="border-b border-line text-[14px] text-muted">
            <tr><th className="py-2 font-normal">File</th><th className="py-2 pr-4 text-right font-normal">Pages × copies</th><th className="py-2 font-normal">Settings</th><th className="no-print" /></tr>
          </thead>
          <tbody>
            {o.items.map((i) => (
              <tr key={i.id} className="border-b border-line align-top">
                <td className="py-2 pr-2">
                  <p className="font-medium">{i.fileName}</p>
                  {i.file && <p className="text-xs text-muted">{fileSize(i.file.sizeBytes)}</p>}
                </td>
                <td className="num py-2 pr-4 text-right">
                  {i.printedPages}{i.pageRange ? ` (${i.pageRange})` : ''} × {i.copies}
                </td>
                <td className="py-2 pr-2">
                  <strong>{i.color === 'COLOR' ? 'Colour' : 'B/W'}</strong> · {i.paperSize} · {i.sides === 'DOUBLE' ? 'Double' : 'Single'} · {{ NORMAL_70: '70 GSM', BOND_80: 'bond 80 GSM', GLOSSY: 'glossy' }[i.paperQuality]} · {i.orientation.toLowerCase()} · {i.fitMode === 'FIT' ? 'fit' : 'actual size'}
                  {i.binding !== 'NONE' && <> · <strong>{i.binding.toLowerCase()} binding</strong></>}
                  {i.lamination !== 'NONE' && <> · <strong>{i.lamination === 'SINGLE' ? 'one-side' : 'two-side'} lamination</strong></>}
                </td>
                <td className="no-print py-2">
                  {i.file?.deletedAt ? (
                    <span className="text-xs text-muted">File deleted</span>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => download.mutate({ fileId: i.fileId, name: i.fileName })}>Download</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {o.specialInstructions && <div className="mt-3"><Alert tone="amber"><strong>Instructions:</strong> {o.specialInstructions}</Alert></div>}
        <p className="mt-3 text-right font-semibold">Total paid: {rupees(o.total)} {o.payments?.some((p) => p.status === 'REFUNDED') && '(refunded)'}</p>
      </Card>

      <div className="no-print flex flex-col gap-4">
        <Card className="space-y-3">
          <h2 className="font-semibold">Update status</h2>
          {err && <ErrorState error={err} />}
          {o.status === 'PAID' && <Button variant="primary" className="w-full" loading={status.isPending} onClick={() => status.mutate({ status: 'PRINTING' })}>Start printing</Button>}
          {o.status === 'PRINTING' && o.fulfillment === 'PICKUP' && <Button variant="primary" className="w-full" loading={status.isPending} onClick={() => status.mutate({ status: 'READY' })}>Mark ready for pickup</Button>}
          {o.status === 'PRINTING' && o.fulfillment === 'DELIVERY' && (
            <>
              <Input label="Delivery person (optional)" value={partner} onChange={(e) => setPartner(e.target.value)} />
              <Button variant="primary" className="w-full" loading={status.isPending} onClick={() => status.mutate({ status: 'OUT_FOR_DELIVERY', partnerName: partner || undefined })}>Mark out for delivery</Button>
            </>
          )}
          {o.status === 'READY' && (
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); status.mutate({ status: 'COMPLETED', pickupOtp: otp }); }}>
              <Input label="Customer's pickup OTP" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} />
              <Button variant="primary" type="submit" className="w-full" loading={status.isPending} disabled={otp.length !== 6}>Verify & complete</Button>
            </form>
          )}
          {o.status === 'OUT_FOR_DELIVERY' && <Button variant="primary" className="w-full" loading={status.isPending} onClick={() => status.mutate({ status: 'COMPLETED' })}>Mark delivered</Button>}
          {['PAID', 'PRINTING', 'READY'].includes(o.status) && (
            <Button
              variant="danger"
              className="w-full"
              loading={status.isPending}
              onClick={() => {
                const note = prompt('Reason for cancelling? The customer gets a full refund.');
                if (note) status.mutate({ status: 'CANCELLED', note });
              }}
            >
              Cancel & refund
            </Button>
          )}
          {['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(o.status) && <p className="text-sm text-muted">No further actions.</p>}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Timeline</h2>
          <StatusTimeline order={o} />
          {o.refunds && o.refunds.length > 0 && (
            <div className="mt-4 space-y-1 text-sm">
              {o.refunds.map((r) => <p key={r.id}>Refund {rupees(r.amount)} · {r.status.toLowerCase()} · {r.reason}</p>)}
            </div>
          )}
          {o.status === 'OUT_FOR_DELIVERY' && (
            <form className="mt-4 space-y-2" onSubmit={(e) => { e.preventDefault(); refund.mutate(); }}>
              <Input label="Issue a refund (reason)" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
              <Button type="submit" variant="secondary" size="sm" disabled={refundReason.length < 3} loading={refund.isPending}>Refund in full</Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
