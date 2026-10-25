import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { time12, when } from '@/lib/format';
import { TimePicker, inMinutes, tomorrowAt } from '@/components/TimePicker';
import { usePollWhenOffline, useRealtimeStatus, useSocketEvent } from '@/lib/realtime';
import type { IncomingRequest, User } from '@/lib/types';
import { Alert, Button, ButtonLink, EmptyState, ErrorState, Input, Loading, Tabs, cn } from '@/components/ui';
import { RequestCard } from './RequestCard';

interface DeskData {
  shop: { id: string; name: string; status: string; acceptingRequests: boolean; reopensAt: string | null; nextOpenAt: string | null; openTime: string; closeTime: string; estimatedPickupMins: number; isOpen: boolean; withinHours: boolean };
  counts: { pending: number; accepted: number; printing: number; ready: number; completedToday: number };
  onlinePayment: boolean;
  orders: IncomingRequest[];
}

/** Two-tone chime with Web Audio, so no sound file is needed. */
function chime(ctx: AudioContext) {
  [880, 1320].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f;
    o.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime + i * 0.18;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.start(t);
    o.stop(t + 0.32);
  });
}

function OwnerLogin() {
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => api.post<{ accessToken: string; user: User }>('/auth/login', { identifier, password }),
    onSuccess: signIn,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
  };
  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="display text-[3rem]">Shop desk</h1>
      <p className="mb-6 text-[1.0625rem] text-muted">Sign in to accept print requests for your shop.</p>
      <form onSubmit={submit} className="space-y-4">
        <Input label="Email or mobile" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="h-11 text-[1.0625rem]" />
        <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 text-[1.0625rem]" />
        {login.error && <Alert tone="red">{login.error.message}</Alert>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={login.isPending} disabled={!identifier || !password}>Sign in</Button>
      </form>
    </div>
  );
}

export default function OwnerDesk() {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Loading" />;
  if (!user) return <OwnerLogin />;
  if (user.role === 'CUSTOMER') {
    return (
      <div className="mx-auto max-w-md py-10">
        <EmptyState title="This page is for shop owners" body="You’re signed in as a customer." action={<ButtonLink to="/" variant="primary">Back to printing</ButtonLink>} />
      </div>
    );
  }
  return <Desk />;
}

function Desk() {
  const qc = useQueryClient();
  const [scope, setScope] = useState<'active' | 'done'>('active');
  const poll = usePollWhenOffline(10_000);
  const online = useRealtimeStatus();
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const known = useRef<Set<string> | null>(null);
  const shopId: string | null = null;
  const shopParam = shopId ? `&shopId=${shopId}` : '';

  const q = useQuery({
    queryKey: ['owner-requests', scope, shopId],
    queryFn: () => api.get<DeskData>(`/shop/requests?scope=${scope}${shopParam}`),
    refetchInterval: poll,
  });

  const notifyNew = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      setFresh((s) => new Set([...s, ...ids]));
      if (sound && audio.current) chime(audio.current);
      // The highlight fades after a minute even if nobody taps the card.
      setTimeout(() => setFresh((s) => new Set([...s].filter((x) => !ids.includes(x)))), 60_000);
    },
    [sound],
  );

  // New-request detection works both for socket pushes and for polling fallback.
  useEffect(() => {
    if (scope !== 'active' || !q.data) return;
    const ids = q.data.orders.filter((o) => o.status === 'REQUESTED').map((o) => o.id);
    if (known.current) notifyNew(ids.filter((id) => !known.current!.has(id)));
    known.current = new Set([...(known.current ?? []), ...ids]);
  }, [q.data, scope, notifyNew]);

  const onChange = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['owner-requests'] });
    void qc.invalidateQueries({ queryKey: ['shop-dashboard'] });
  }, [qc]);
  useSocketEvent('order:changed', onChange);
  useSocketEvent('shop:changed', onChange);

  const [closing, setClosing] = useState(false);
  const [reopenAt, setReopenAt] = useState(() => inMinutes(60));
  const toggleOpen = useMutation({
    mutationFn: (v: { open: boolean; reopensAt?: string | null }) => api.post(`/shop/open?${shopParam.slice(1)}`, v),
    onSuccess: () => {
      setClosing(false);
      onChange();
    },
  });

  const enableSound = () => {
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
      chime(audio.current);
      setSound(true);
    } catch {
      setSound(false);
    }
  };

  if (q.isPending) return <Loading label="Loading requests" rows={5} />;
  if (q.error instanceof ApiError && q.error.status === 404) {
    return (
      <EmptyState
        title="You haven't registered a shop yet"
        body="Add your shop's address, hours and prices to start receiving print requests."
        action={<ButtonLink variant="primary" to="/shop/register">Register your shop</ButtonLink>}
      />
    );
  }
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;

  const counters = [
    { label: 'Pending', value: d.counts.pending, lead: true },
    { label: 'Accepted', value: d.counts.accepted },
    { label: 'Printing', value: d.counts.printing },
    { label: 'Ready', value: d.counts.ready },
    { label: 'Completed today', value: d.counts.completedToday },
  ];

  return (
    <div className="space-y-6">
      {d.shop.status !== 'APPROVED' && (
        <Alert tone={d.shop.status === 'PENDING' ? 'amber' : 'red'}>
          {d.shop.status === 'PENDING' ? 'Waiting for approval. Customers will see your shop once PrintPoint approves it.' : `Your shop is ${d.shop.status.toLowerCase()}. Contact PrintPoint support.`}
        </Alert>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.25rem] font-semibold leading-8 sm:text-2xl">Requests</h1>
          <p className="mt-1 text-[1.125rem] font-medium">
            {d.counts.pending > 0
              ? `${d.counts.pending} ${d.counts.pending === 1 ? 'request is' : 'requests are'} waiting for you to accept or deny.`
              : d.counts.ready > 0
                ? `Nothing to accept. ${d.counts.ready} ready for pickup.`
                : 'Nothing waiting. New requests appear here the moment they arrive.'}
          </p>
          <p className="mt-1 text-[1rem] text-muted">
            Hours {time12(d.shop.openTime)} – {time12(d.shop.closeTime)}
            {!d.shop.withinHours && ' · outside opening hours'}
            {!d.shop.acceptingRequests && (d.shop.reopensAt ? ` · opens again ${when(d.shop.reopensAt)}` : ' · no reopening time set')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={d.shop.acceptingRequests}
            onClick={() => (d.shop.acceptingRequests ? setClosing(true) : toggleOpen.mutate({ open: true }))}
            disabled={toggleOpen.isPending}
            className={cn(
              'inline-flex min-h-[44px] items-center gap-3 rounded-control border px-4 text-[1.0625rem] font-medium',
              d.shop.acceptingRequests ? 'border-positive text-ink' : 'border-negative text-ink',
            )}
          >
            <span className={cn('h-3 w-3 rounded-full', d.shop.acceptingRequests ? 'bg-positive' : 'bg-negative')} aria-hidden="true" />
            {d.shop.acceptingRequests ? 'Open for requests' : 'Closed to requests'}
          </button>
          {!d.shop.acceptingRequests && !closing && (
            <Button size="lg" onClick={() => setClosing(true)}>{d.shop.reopensAt ? 'Change reopening time' : 'Set reopening time'}</Button>
          )}
          <Button size="lg" variant={sound ? 'ghost' : 'secondary'} onClick={sound ? () => setSound(false) : enableSound}>
            {sound ? 'Sound on' : 'Turn on sound alerts'}
          </Button>
        </div>
      </div>
      {closing && (
        <div className="space-y-3 rounded-card border border-line bg-surface p-4">
          <p className="text-[1.0625rem] font-medium">When will you open again?</p>
          <p className="text-[1rem] text-muted">Customers see this time and can book their orders for it. The shop opens itself again at that time.</p>
          <TimePicker
            label="Opens again at"
            value={reopenAt}
            min={new Date().toISOString()}
            onChange={setReopenAt}
            quick={[
              { label: 'In 30 min', iso: inMinutes(30) },
              { label: 'In 1 hour', iso: inMinutes(60) },
              { label: 'In 2 hours', iso: inMinutes(120) },
              { label: `Tomorrow ${time12(d.shop.openTime)}`, iso: tomorrowAt(d.shop.openTime) },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="lg" loading={toggleOpen.isPending} onClick={() => toggleOpen.mutate({ open: false, reopensAt: reopenAt })}>
              Close until {when(reopenAt)}
            </Button>
            <Button size="lg" disabled={toggleOpen.isPending} onClick={() => toggleOpen.mutate({ open: false, reopensAt: null })}>Close without a time</Button>
            <Button size="lg" variant="ghost" onClick={() => setClosing(false)}>Back</Button>
          </div>
        </div>
      )}
      {toggleOpen.error && <Alert tone="red">{toggleOpen.error.message}</Alert>}
      {!online && poll !== false && <Alert tone="amber">Live connection lost. Reconnecting… The list still refreshes every 10 seconds.</Alert>}

      <dl className="grid grid-cols-2 divide-line overflow-hidden rounded-card border border-line bg-surface sm:grid-cols-5 sm:divide-x">
        {counters.map((c, i) => (
          <div key={c.label} className={cn('px-4 py-3', i > 1 && 'max-sm:border-t', i % 2 === 1 && 'max-sm:border-l', i === 4 && 'max-sm:col-span-2')}>
            <dt className="text-[0.9375rem] text-muted">{c.label}</dt>
            <dd className={cn('num mt-1 text-[1.75rem] font-semibold leading-none', c.lead && c.value > 0 && 'text-data')}>{c.value}</dd>
          </div>
        ))}
      </dl>

      <Tabs value={scope} onChange={setScope} tabs={[{ value: 'active', label: 'Incoming & in progress' }, { value: 'done', label: 'Done, last 7 days' }]} />

      {d.orders.length === 0 ? (
        <EmptyState
          title={scope === 'active' ? 'No requests right now' : 'Nothing finished in the last 7 days'}
          body={scope === 'active' ? (d.shop.isOpen ? 'New requests appear here instantly.' : 'Your shop is closed to customers. Open it to receive requests.') : undefined}
        />
      ) : (
        <div className="grid items-start gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {d.orders.map((o) => (
            <div key={o.id} onClick={() => fresh.has(o.id) && setFresh((s) => new Set([...s].filter((x) => x !== o.id)))}>
              <RequestCard order={o} highlight={fresh.has(o.id)} onlinePayment={d.onlinePayment} defaultReadyMins={d.shop.estimatedPickupMins} />
            </div>
          ))}
        </div>
      )}

      <p className="text-[0.9375rem] text-muted">
        Customer phone numbers are hidden except the last 4 digits. Files are deleted automatically after pickup, or 24 hours at most.
      </p>
    </div>
  );
}
