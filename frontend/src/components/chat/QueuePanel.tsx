import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { minutesLabel, rupees, time12, when } from '@/lib/format';
import { usePollWhenOffline, useQueueRoom, useSocketEvent } from '@/lib/realtime';
import type { QueueInfo } from '@/lib/types';
import { Badge, ErrorState, cn } from '../ui';

export function useShopQueue(shopId: string | null) {
  const qc = useQueryClient();
  const poll = usePollWhenOffline();
  useQueueRoom(shopId);
  const onChange = useCallback(
    (p: { shopId: string }) => void qc.invalidateQueries({ queryKey: ['queue', p.shopId] }),
    [qc],
  );
  useSocketEvent('queue:changed', onChange);
  return useQuery({
    queryKey: ['queue', shopId],
    queryFn: () => api.get<{ queue: QueueInfo }>(`/shops/${shopId}/queue`).then((r) => r.queue),
    enabled: Boolean(shopId),
    refetchInterval: poll,
    staleTime: 5_000,
  });
}

function Body({ q }: { q: QueueInfo }) {
  const rate = (label: string, v: number) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="num">{rupees(v)}</dd>
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={q.isOpen ? 'green' : 'red'}>{q.isOpen ? 'Open now' : 'Closed'}</Badge>
        <span className="text-[16px] text-muted">
          {q.hoursToday ? `Today ${time12(q.hoursToday.open)} – ${time12(q.hoursToday.close)}` : 'Closed today'}
        </span>
      </div>
      {!q.isOpen && q.nextOpenAt && (
        <p className="text-[16px]">
          Opens <span className="font-medium">{when(q.nextOpenAt)}</span>. You can book your order for then.
        </p>
      )}
      {!q.isOpen && !q.nextOpenAt && <p className="text-[16px] text-muted">The shop hasn’t said when it opens again.</p>}

      <dl className="grid grid-cols-3 divide-x divide-line rounded-card border border-line bg-surface text-center">
        <div className="px-2 py-3">
          <dt className="text-[14px] text-muted">Waiting</dt>
          <dd className="num display mt-1 text-[34px] leading-none">{q.pending}</dd>
        </div>
        <div className="px-2 py-3">
          <dt className="text-[14px] text-muted">Printing</dt>
          <dd className="num display mt-1 text-[34px] leading-none">{q.printing}</dd>
        </div>
        <div className="px-2 py-3">
          <dt className="text-[14px] text-muted">Est. wait</dt>
          <dd className="num display mt-1 text-[34px] leading-none">{q.estimatedWaitMins}<span className="text-[18px]">m</span></dd>
        </div>
      </dl>
      <p className="-mt-3 text-[14px] text-muted">Wait is an estimate (about {minutesLabel(q.estimatedWaitMins)}) based on the jobs ahead of you.</p>

      <div>
        <h3 className="display text-[24px]">Price list</h3>
        {q.prices ? (
          <dl className="mt-1 divide-y divide-rule text-[16px]">
            {rate('B/W, single-sided · per page', q.prices.bwSingle)}
            {rate('B/W, double-sided · per page', q.prices.bwDouble)}
            {rate('Colour, single-sided · per page', q.prices.colorSingle)}
            {rate('Colour, double-sided · per page', q.prices.colorDouble)}
            {q.prices.spiralBinding > 0 && rate('Spiral binding · per copy', q.prices.spiralBinding)}
            {q.prices.taxPercent > 0 && (
              <div className="flex justify-between py-1.5">
                <dt className="text-muted">Tax</dt>
                <dd className="num">{q.prices.taxPercent}%</dd>
              </div>
            )}
            {q.prices.minOrderAmount > 0 && rate('Minimum order', q.prices.minOrderAmount)}
          </dl>
        ) : (
          <p className="mt-1 text-[16px] text-muted">This shop hasn’t published prices yet.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Desktop: a sticky column beside the chat. Phone: a collapsible sheet at the top.
 */
export function QueuePanel({ shopId }: { shopId: string | null }) {
  const q = useShopQueue(shopId);
  const [open, setOpen] = useState(false);

  const content = !shopId ? (
    <p className="text-[16px] text-muted">Choose a shop in the chat to see how busy it is and its prices.</p>
  ) : q.isPending ? (
    <div className="space-y-3" role="status" aria-label="Loading shop queue">
      <div className="h-6 w-1/2 rounded bg-active" />
      <div className="h-20 rounded-card bg-active" />
      <div className="h-32 rounded-card bg-active" />
    </div>
  ) : q.error ? (
    <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  ) : (
    <Body q={q.data} />
  );

  return (
    <>
      {/* Phone: summary bar that expands */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-ground px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-h-[48px] w-full items-center justify-between gap-3 text-left text-[16px]"
        >
          {shopId && q.data ? (
            <span className="min-w-0 truncate">
              <span className={cn('mr-2 inline-block h-2.5 w-2.5 rounded-full', q.data.isOpen ? 'bg-positive' : 'bg-negative')} aria-hidden="true" />
              <span className="font-medium">{q.data.name}</span>
              <span className="text-muted"> · {q.data.pending} waiting · ~{q.data.estimatedWaitMins} min</span>
            </span>
          ) : (
            <span className="text-muted">Shop queue & prices</span>
          )}
          <span className="flex-none text-[15px] underline underline-offset-2">{open ? 'Hide' : 'Show'}</span>
        </button>
        {open && <div className="pb-4">{content}</div>}
      </div>

      {/* Desktop column */}
      <aside className="hidden lg:col-start-2 lg:row-start-1 lg:block" aria-label="Shop queue">
        <div className="sticky top-6 rounded-card border border-line bg-raised p-5">
          <h2 className="display text-[32px]">{q.data?.name ?? 'Shop queue'}</h2>
          <div className="mt-3">{content}</div>
        </div>
      </aside>
    </>
  );
}
