import { dateTime, STATUS_LABEL, STATUS_TONE } from '@/lib/format';
import type { Order, OrderStatus } from '@/lib/types';
import { Badge, cn } from './ui';

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function StatusTimeline({ order }: { order: Order }) {
  const terminal = order.status === 'CANCELLED' || order.status === 'REFUNDED';
  const steps: { key: OrderStatus; label: string }[] = [
    { key: 'PENDING_PAYMENT', label: 'Order placed' },
    { key: 'PAID', label: 'Payment confirmed' },
    { key: 'PRINTING', label: 'Printing' },
    order.fulfillment === 'DELIVERY' ? { key: 'OUT_FOR_DELIVERY', label: 'Out for delivery' } : { key: 'READY', label: 'Ready for pickup' },
    { key: 'COMPLETED', label: 'Completed' },
  ];
  const events = order.events ?? [];
  const at = (s: OrderStatus) => events.filter((e) => e.status === s).at(-1)?.createdAt;
  const reachedIdx = Math.max(-1, ...steps.map((s, i) => (at(s.key) || order.status === s.key ? i : -1)));
  const shown = terminal ? steps.filter((_, i) => i <= reachedIdx) : steps;
  if (terminal) shown.push({ key: order.status, label: order.status === 'REFUNDED' ? 'Refunded' : 'Cancelled' });

  return (
    <ol className="relative space-y-5 border-l-2 border-line pl-6" aria-label="Order progress">
      {shown.map((s, i) => {
        const done = terminal ? true : i <= reachedIdx;
        const bad = s.key === 'CANCELLED' || s.key === 'REFUNDED';
        const ts = at(s.key);
        return (
          <li key={s.key} className="relative">
            <span
              className={cn(
                'absolute -left-[31px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2',
                bad ? 'border-red-500 bg-red-500' : done ? 'border-ink bg-primary' : 'border-line bg-surface  ',
              )}
              aria-hidden="true"
            />
            <p className={cn('text-sm font-medium', !done && 'text-muted')}>
              {s.label}
              <span className="sr-only">{done ? ' (done)' : ' (pending)'}</span>
            </p>
            {ts && <p className="text-xs text-muted">{dateTime(ts)}</p>}
            {events.find((e) => e.status === s.key && e.note && !['Order placed', 'Payment confirmed'].includes(e.note)) && (
              <p className="text-xs text-muted">{events.find((e) => e.status === s.key)?.note}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
