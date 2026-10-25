import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { clock, dateTime, rupees, STATUS_LABEL, when } from '@/lib/format';
import { payForOrder } from '@/lib/razorpay';
import type { OrderStatus, PrintRequest } from '@/lib/types';
import { Alert, Badge, Button, cn } from '../ui';

export const STEPS: { key: string; label: string; done: OrderStatus[] }[] = [
  { key: 'sent', label: 'Sent', done: ['REQUESTED', 'ACCEPTED', 'PAID', 'PRINTING', 'READY', 'COMPLETED'] },
  { key: 'accepted', label: 'Accepted', done: ['ACCEPTED', 'PAID', 'PRINTING', 'READY', 'COMPLETED'] },
  { key: 'printing', label: 'Printing', done: ['PRINTING', 'READY', 'COMPLETED'] },
  { key: 'ready', label: 'Ready', done: ['READY', 'COMPLETED'] },
  { key: 'collected', label: 'Collected', done: ['COMPLETED'] },
];

export const TONE: Partial<Record<OrderStatus, 'amber' | 'green' | 'red' | 'gray' | 'brass'>> = {
  REQUESTED: 'amber',
  ACCEPTED: 'brass',
  PAID: 'brass',
  PRINTING: 'brass',
  READY: 'green',
  COMPLETED: 'gray',
  DENIED: 'red',
  CANCELLED: 'red',
  REFUNDED: 'red',
};

function headline(o: PrintRequest): string {
  switch (o.status) {
    case 'REQUESTED':
      return o.scheduledFor ? `Booked for ${when(o.scheduledFor)}. Waiting for ${o.shop.name} to accept` : `Waiting for ${o.shop.name} to accept`;
    case 'ACCEPTED':
      return o.onlinePayment ? 'Accepted. Pay now so the shop can start printing' : 'Accepted. Pay at the counter when you collect';
    case 'PAID':
      return 'Paid. The shop will start printing shortly';
    case 'PRINTING':
      return 'Printing now';
    case 'READY':
      return 'Ready for pickup';
    case 'COMPLETED':
      return 'Collected. Thank you!';
    case 'DENIED':
      return `${o.shop.name} couldn’t take this request`;
    case 'CANCELLED':
      return 'Request cancelled';
    case 'REFUNDED':
      return 'Refunded';
    default:
      return STATUS_LABEL[o.status];
  }
}

/** One request, updating live. Shows the pickup code once accepted. */
export function StatusCard({ order, compact }: { order: PrintRequest; compact?: boolean }) {
  const qc = useQueryClient();
  const [payMsg, setPayMsg] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['requests'] });

  const cancel = useMutation({ mutationFn: () => api.post(`/requests/${order.id}/cancel`), onSuccess: refresh });
  const answer = useMutation({ mutationFn: (accept: boolean) => api.post(`/requests/${order.id}/new-time`, { accept }), onSuccess: refresh });
  const pay = useMutation({
    mutationFn: () => payForOrder(order.id),
    onSuccess: (r) => {
      setPayMsg(r.kind === 'success' ? null : r.kind === 'failed' ? r.reason : 'Payment window closed. You can pay any time before pickup.');
      refresh();
    },
  });

  const ended = ['DENIED', 'CANCELLED', 'REFUNDED'].includes(order.status);
  const showCode = order.pickupOtp && ['ACCEPTED', 'PAID', 'PRINTING', 'READY'].includes(order.status);
  const pages = order.items.reduce((s, i) => s + i.printedPages * i.copies, 0);
  const cancelledNote = order.status === 'CANCELLED' ? order.events.filter((e) => e.status === 'CANCELLED').at(-1)?.note : null;

  return (
    <article className="overflow-hidden rounded-card border border-line bg-surface" aria-live="polite">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-[0.9375rem] text-muted">
            <span className="num">{order.orderNumber}</span> · {dateTime(order.createdAt)}
          </p>
          <h3 className="mt-0.5 text-[1.1875rem] font-semibold leading-7">{headline(order)}</h3>
        </div>
        <Badge tone={TONE[order.status] ?? 'gray'}>{STATUS_LABEL[order.status]}</Badge>
      </header>

      <div className="space-y-4 px-4 py-4">
        {!ended && (
          <ol className="grid grid-cols-5 gap-1" aria-label="Progress">
            {STEPS.map((s) => {
              const done = s.done.includes(order.status);
              return (
                <li key={s.key} className="min-w-0">
                  <div className={cn('h-1.5 rounded-full', done ? 'bg-ink' : 'bg-active')} />
                  <p className={cn('mt-1.5 truncate text-[0.8125rem] sm:text-[0.875rem]', done ? 'text-ink' : 'text-muted')}>{s.label}</p>
                </li>
              );
            })}
          </ol>
        )}

        {order.proposedTime && !ended && (
          <div className="space-y-3 rounded-card border border-ink bg-raised p-4">
            <p className="text-[1.0625rem]">
              <span className="font-medium">{order.shop.name} is busy</span> and asked to move your order to{' '}
              <span className="font-medium">{when(order.proposedTime)}</span>.
            </p>
            {order.proposedNote && <p className="text-[1rem] text-muted">“{order.proposedNote}”</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="lg" loading={answer.isPending && answer.variables === true} disabled={answer.isPending} onClick={() => answer.mutate(true)}>
                OK, move it
              </Button>
              <Button size="lg" loading={answer.isPending && answer.variables === false} disabled={answer.isPending} onClick={() => answer.mutate(false)}>
                Keep my time
              </Button>
            </div>
            {answer.error && <Alert tone="red">{answer.error.message}</Alert>}
          </div>
        )}
        {order.scheduledFor && !ended && order.status !== 'COMPLETED' && !order.proposedTime && (
          <p className="text-[1rem]">
            Booked for <span className="font-medium">{when(order.scheduledFor)}</span>
          </p>
        )}

        {order.status === 'DENIED' && (
          <Alert tone="red">
            <span className="font-medium">Reason from the shop:</span> {order.denyReason ?? 'No reason given'}. You haven’t been charged. You can change it and send it again.
          </Alert>
        )}
        {cancelledNote && <p className="text-[1rem] text-muted">{cancelledNote}.</p>}

        {showCode && (
          <div className="flex flex-wrap items-end justify-between gap-4 rounded-card bg-ink px-4 py-4 text-on-primary">
            <div>
              <p className="text-[0.9375rem] opacity-80">Pickup code. Show this at the counter</p>
              <p className="num display mt-1 text-[3.25rem] leading-none tracking-[0.12em]">{order.pickupOtp}</p>
            </div>
            {order.estimatedReadyAt && order.status !== 'READY' && (
              <div className="text-right">
                <p className="text-[0.9375rem] opacity-80">Estimated ready</p>
                <p className="num text-[1.375rem] font-medium">{clock(order.estimatedReadyAt)}</p>
              </div>
            )}
          </div>
        )}

        {order.status === 'ACCEPTED' && order.onlinePayment && (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="brass" size="lg" loading={pay.isPending} onClick={() => pay.mutate()}>
              Pay {rupees(order.total)}
            </Button>
            <span className="text-[0.9375rem] text-muted">Secure payment by Razorpay</span>
          </div>
        )}
        {payMsg && <Alert tone="amber">{payMsg}</Alert>}
        {pay.error && <Alert tone="red">{pay.error.message}</Alert>}

        {!compact && (
          <div className="space-y-1 text-[1rem]">
            {order.items.map((i) => (
              <p key={i.id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{i.fileName}</span>
                <span className="num whitespace-nowrap text-muted">{i.printedPages} pg × {i.copies}</span>
              </p>
            ))}
            <p className="text-[0.9375rem] text-muted">
              {order.items[0]?.color === 'COLOR' ? 'Colour' : 'B/W'} · {order.items[0]?.sides === 'DOUBLE' ? 'Double-sided' : 'Single-sided'}
              {order.items[0]?.binding === 'SPIRAL' && ' · Spiral binding'} · <span className="num">{pages}</span> printed pages
            </p>
            {order.specialInstructions && <p className="text-[0.9375rem] text-muted">Your note: “{order.specialInstructions}”</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <p className="text-[1.0625rem]">
            Total <span className="num font-semibold">{rupees(order.total)}</span>
          </p>
          {order.status === 'REQUESTED' && (
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
              Cancel request
            </Button>
          )}
        </div>
        {cancel.error && <Alert tone="red">{cancel.error.message}</Alert>}
        {!ended && order.status !== 'COMPLETED' && <p className="text-[0.875rem] text-muted">Your files are deleted after pickup, or 24 hours at most.</p>}
      </div>
    </article>
  );
}
