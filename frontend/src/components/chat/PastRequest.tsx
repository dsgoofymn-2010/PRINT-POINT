import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { rupees, STATUS_LABEL } from '@/lib/format';
import type { PrintRequest } from '@/lib/types';
import { Badge, cn } from '../ui';
import { STEPS, TONE } from './StatusCard';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** A finished request as one line; tap it to see its progress and files. */
export function PastRequest({ order }: { order: PrintRequest }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const ended = ['DENIED', 'CANCELLED', 'REFUNDED'].includes(order.status);
  const files = order.items.map((i) => i.fileName).join(', ');

  return (
    <li className="rounded-card bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-active/60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{files || 'Print request'}</span>
          <span className="block text-[0.875rem] text-muted">{shortDate(order.createdAt)}</span>
        </span>
        <Badge tone={TONE[order.status] ?? 'gray'}>{STATUS_LABEL[order.status]}</Badge>
        <span className="num w-20 flex-none text-right">{rupees(order.total)}</span>
        <svg viewBox="0 0 12 12" className={cn('h-3 w-3 flex-none text-muted transition-transform duration-200', open && 'rotate-180')} aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-4 pb-4">
              {ended ? (
                <p className="text-[0.9375rem] text-muted">
                  {order.status === 'DENIED' ? `Denied: ${order.denyReason ?? 'no reason given'}. You weren’t charged.` : STATUS_LABEL[order.status]}
                </p>
              ) : (
                <ol className="grid grid-cols-5 gap-1" aria-label="Progress">
                  {STEPS.map((s) => {
                    const done = s.done.includes(order.status);
                    return (
                      <li key={s.key} className="min-w-0">
                        <div className={cn('h-1.5 rounded-full', done ? 'bg-ink' : 'bg-active')} />
                        <p className={cn('mt-1.5 truncate text-[0.8125rem]', done ? 'text-ink' : 'text-muted')}>{s.label}</p>
                      </li>
                    );
                  })}
                </ol>
              )}
              <p className="text-[0.875rem] text-muted">
                {order.orderNumber ?? 'Not paid'} · {order.items[0]?.color === 'COLOR' ? 'Colour' : 'B/W'} · {order.items.reduce((n, i) => n + i.printedPages * i.copies, 0)} pages
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
