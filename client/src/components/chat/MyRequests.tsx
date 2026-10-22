import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePollWhenOffline, useSocketEvent } from '@/lib/realtime';
import type { PrintRequest } from '@/lib/types';
import { EmptyState, ErrorState } from '../ui';
import { StatusCard } from './StatusCard';

const ACTIVE = ['REQUESTED', 'ACCEPTED', 'PAID', 'PRINTING', 'READY'];

/** The signed-in customer's requests, refreshed whenever the server says one changed. */
export function useMyRequests() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const poll = usePollWhenOffline();
  const onChange = useCallback(() => void qc.invalidateQueries({ queryKey: ['requests'] }), [qc]);
  useSocketEvent('order:changed', onChange);
  return useQuery({
    queryKey: ['requests', user?.id],
    queryFn: () => api.get<{ orders: PrintRequest[] }>('/requests').then((r) => r.orders),
    enabled: Boolean(user),
    refetchInterval: poll,
  });
}

export const isActive = (o: PrintRequest) => ACTIVE.includes(o.status);

export function MyRequests({ onNew }: { onNew: () => void }) {
  const q = useMyRequests();
  if (q.isPending) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading your requests">
        <div className="h-40 rounded-card bg-active" />
        <div className="h-40 rounded-card bg-active" />
      </div>
    );
  }
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const active = q.data.filter(isActive);
  const past = q.data.filter((o) => !isActive(o));
  if (q.data.length === 0) {
    return (
      <EmptyState
        title="No requests yet"
        body="Send your first print request and it will show up here with live status."
        action={
          <button onClick={onNew} className="min-h-[44px] rounded-control bg-primary px-5 text-[17px] font-medium text-on-primary">
            Start a request
          </button>
        }
      />
    );
  }
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="display text-[30px]">Active</h2>
        {active.length ? active.map((o) => <StatusCard key={o.id} order={o} />) : <p className="text-[17px] text-muted">Nothing in progress.</p>}
      </section>
      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="display text-[30px]">Past</h2>
          {past.map((o) => <StatusCard key={o.id} order={o} compact />)}
        </section>
      )}
    </div>
  );
}
