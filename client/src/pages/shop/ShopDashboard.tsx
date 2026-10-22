import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { rupees } from '@/lib/format';
import type { Order, OrderStatus, ServiceType } from '@/lib/types';
import { Bars } from '@/components/Bars';
import { StatusBadge } from '@/components/StatusTimeline';
import { Alert, Button, ButtonLink, Card, EmptyState, ErrorState, Input, Loading, PageTitle, Tabs, cn } from '@/components/ui';
import { ShopProfileForm, type ShopProfile } from './ShopProfileForm';

/*
  Shop desk, style "Achromatic ledger" (seed 1499594586).
  Screen question: which paid orders are waiting, and what have we taken today?
  Face: the stone-paper ground; brass only on today's bar. Signature element: the print queue, oldest first,
  with the next action on each row.
*/

interface Dashboard {
  shop: { id: string; name: string; status: string };
  stats: { todayOrders: number; todayRevenue: number; pendingOrders: number; completedToday: number };
  recent: Order[];
}
interface AnalyticsData {
  days: number;
  series: { date: string; orders: number; revenue: number }[];
  totals: { orders: number; revenue: number; averageOrderValue: number };
  topServices: { name: string; units: number }[];
}

type Tab = 'today' | 'orders' | 'sales' | 'profile';

export function minutesAgo(iso: string | null) {
  if (!iso) return '—';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${m % 60} min ago` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const pagesOf = (o: Order) => o.items.reduce((s, i) => s + i.printedPages * i.copies, 0);

/** The next thing the shop does with an order, in the shop's own words. */
const NEXT: Partial<Record<OrderStatus, string>> = { PAID: 'Start printing', PRINTING: 'Mark done', READY: 'Check code', OUT_FOR_DELIVERY: 'Mark delivered' };

export default function ShopDashboard() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'today';
  const setTab = (t: Tab) => setParams(t === 'today' ? {} : { tab: t });
  const dash = useQuery({ queryKey: ['shop-dashboard'], queryFn: () => api.get<Dashboard>('/shop/dashboard'), refetchInterval: 30_000 });

  if (dash.isLoading) return <Loading label="Loading your shop" rows={5} />;
  if (dash.error instanceof ApiError && dash.error.status === 404) {
    return (
      <>
        <PageTitle title="Your shop" />
        <EmptyState title="You haven't registered a shop yet" body="Add your shop's address, hours and prices to start taking paid orders." action={<ButtonLink variant="primary" to="/shop/register">Register your shop</ButtonLink>} />
      </>
    );
  }
  if (dash.error) return <ErrorState error={dash.error} onRetry={() => void dash.refetch()} />;
  const d = dash.data!;

  return (
    <div>
      {d.shop.status !== 'APPROVED' && (
        <div className="mb-5">
          <Alert tone={d.shop.status === 'PENDING' ? 'amber' : 'red'}>
            {d.shop.status === 'PENDING' ? 'Waiting for approval. Customers will see your shop once PrintPoint approves it, usually within a day.' : `Your shop is ${d.shop.status.toLowerCase()}. Contact PrintPoint support.`}
          </Alert>
        </div>
      )}
      {tab === 'today' && <Today d={d} />}
      {tab !== 'today' && (
        <>
          <PageTitle title={{ orders: 'Orders', sales: 'Takings', profile: 'Shop details' }[tab]} subtitle={d.shop.name} />
          <div className="mb-6">
            <Tabs value={tab} onChange={setTab} tabs={[{ value: 'today', label: 'Today' }, { value: 'orders', label: 'Orders' }, { value: 'sales', label: 'Takings' }, { value: 'profile', label: 'Shop details' }]} />
          </div>
          {tab === 'orders' && <OrdersPanel />}
          {tab === 'sales' && <Takings />}
          {tab === 'profile' && <ProfilePanel />}
        </>
      )}
    </div>
  );
}

function Today({ d }: { d: Dashboard }) {
  const navigate = useNavigate();
  const queue = useQuery({
    queryKey: ['shop-orders', 'QUEUE'],
    queryFn: async () => {
      const [paid, printing, ready, out] = await Promise.all(
        (['NEW', 'PRINTING', 'READY', 'OUT_FOR_DELIVERY'] as const).map((s) => api.get<{ orders: Order[] }>(`/shop/orders?status=${s}`)),
      );
      // Oldest paid first: that customer has waited longest.
      return [...paid.orders, ...printing.orders, ...ready.orders, ...out.orders].sort((a, b) => +new Date(a.paidAt ?? 0) - +new Date(b.paidAt ?? 0));
    },
    refetchInterval: 20_000,
  });
  const sales = useQuery({ queryKey: ['shop-analytics', 7], queryFn: () => api.get<AnalyticsData>('/shop/analytics?days=7') });
  const waiting = queue.data ?? [];
  const toPrint = waiting.filter((o) => o.status === 'PAID');
  const oldest = toPrint[0];
  const finding = !queue.data
    ? ' '
    : toPrint.length
      ? `${toPrint.length} paid ${toPrint.length === 1 ? 'order' : 'orders'} to print · oldest paid ${minutesAgo(oldest.paidAt)}`
      : waiting.length
        ? `Nothing new to print · ${waiting.length} in progress`
        : 'All caught up. New paid orders appear here on their own.';

  return (
    <div className="space-y-4">
      <PageTitle
        title="Today"
        subtitle={finding}
        action={
          <>
            <ButtonLink to="/shop/pricing">Price list</ButtonLink>
            <Button variant="primary" disabled={!oldest} onClick={() => oldest && navigate(`/shop/orders/${oldest.id}`)}>
              Print next order
            </Button>
          </>
        }
      />

      <Card title={<>Print queue <span className="num font-normal text-muted">{waiting.length}</span></>} action={<Link to="/shop?tab=orders" className="text-sm text-muted hover:text-ink">All orders</Link>} flush>
        {queue.isLoading ? (
          <div className="px-5 pb-5"><Loading rows={4} /></div>
        ) : queue.error ? (
          <div className="px-5 pb-5"><ErrorState error={queue.error} onRetry={() => void queue.refetch()} /></div>
        ) : waiting.length === 0 ? (
          <p className="mx-5 mb-5 rounded-control border border-dashed border-control px-4 py-3 text-sm text-muted">No orders waiting. Keep this screen open: paid orders arrive here within 20 seconds.</p>
        ) : (
          <OrderTable orders={waiting.slice(0, 6)} showAction />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Takings, last 7 days" action={<Link to="/shop?tab=sales" className="text-sm text-muted hover:text-ink">30 days</Link>}>
          <div className="mb-4 grid grid-cols-3 gap-4 border-b border-line pb-4">
            <Figure label="Taken today" value={rupees(d.stats.todayRevenue)} lead />
            <Figure label="Orders today" value={String(d.stats.todayOrders)} />
            <Figure label="Collected today" value={String(d.stats.completedToday)} />
          </div>
          {sales.isLoading ? (
            <Loading rows={2} />
          ) : sales.error ? (
            <ErrorState error={sales.error} />
          ) : (
            <Bars
              ariaLabel="Takings per day for the last 7 days; today is highlighted"
              format={(v) => `₹${Math.round(v / 100).toLocaleString('en-IN')}`}
              data={sales.data!.series.map((s, i, all) => ({
                label: i === all.length - 1 ? 'Today' : new Date(s.date).toLocaleDateString('en-IN', { weekday: 'short' }),
                value: s.revenue,
                highlight: i === all.length - 1,
              }))}
            />
          )}
        </Card>
        <Card title="What sold this week" className="flex flex-col">
          {sales.data && sales.data.topServices.length > 0 ? (
            <ul className="space-y-3">
              {sales.data.topServices.map((s, i) => {
                const top = sales.data!.topServices[0].units;
                return (
                  <li key={s.name}>
                    <div className="flex justify-between text-sm">
                      <span>{s.name}</span>
                      <span className="num">{s.units.toLocaleString('en-IN')} {s.name.includes('xerox') || s.name.includes('printing') ? 'pages' : 'copies'}</span>
                    </div>
                    <div className="mt-1 h-0.5 bg-rule">
                      <div className={cn('h-full', i === 0 ? 'bg-ink' : 'bg-control')} style={{ width: `${(s.units / top) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">No sales in the last 7 days yet.</p>
          )}
          {sales.data && (
            <dl className="mt-6 border-t border-line pt-3 text-sm">
              <div className="flex justify-between py-1.5"><dt className="text-muted">Paid orders, 7 days</dt><dd className="num">{sales.data.totals.orders}</dd></div>
              <div className="flex justify-between py-1.5"><dt className="text-muted">Taken, 7 days</dt><dd className="num">{rupees(sales.data.totals.revenue)}</dd></div>
              <div className="flex justify-between py-1.5"><dt className="text-muted">Average order</dt><dd className="num">{rupees(sales.data.totals.averageOrderValue)}</dd></div>
              <div className="flex justify-between py-1.5"><dt className="text-muted">Busiest day</dt><dd>{(() => { const best = [...sales.data.series].sort((x, y) => y.revenue - x.revenue)[0]; return best && best.revenue > 0 ? new Date(best.date).toLocaleDateString('en-IN', { weekday: 'long' }) : '—'; })()}</dd></div>
            </dl>
          )}
        </Card>
      </div>
    </div>
  );
}

function Figure({ label, value, lead }: { label: string; value: string; lead?: boolean }) {
  return (
    <div>
      <p className="text-[14px] text-muted">{label}</p>
      <p className={cn('num mt-0.5 leading-tight', lead ? 'text-[30px] font-semibold' : 'text-2xl')}>{value}</p>
    </div>
  );
}

/** Orders as rules and alignment; becomes two-line rows on a phone. */
function OrderTable({ orders, showAction }: { orders: Order[]; showAction?: boolean }) {
  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,2.4fr)_0.7fr_0.9fr_1fr_0.9fr_auto] gap-4 px-5 pb-2 text-[14px] text-muted md:grid">
        <span>Order</span>
        <span className="text-right">Pages</span>
        <span>How</span>
        <span>Paid</span>
        <span className="text-right">Total</span>
        <span className="w-[132px]">{showAction ? 'Next' : 'Status'}</span>
      </div>
      <ul>
        {orders.map((o) => (
          <li key={o.id} className="border-t border-rule first:border-t-0 md:first:border-t">
            <Link
              to={`/shop/orders/${o.id}`}
              className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-5 py-3 hover:bg-raised md:grid-cols-[minmax(0,2.4fr)_0.7fr_0.9fr_1fr_0.9fr_auto] md:py-0 md:h-14"
            >
              <span className="min-w-0 truncate">
                <span className="num font-medium">{o.orderNumber}</span> <span className="text-muted">· {o.customer?.name}</span>
              </span>
              <span className="num hidden text-right md:block">{pagesOf(o)}</span>
              <span className="hidden text-muted md:block">{o.fulfillment === 'DELIVERY' ? 'Delivery' : 'Pickup'}</span>
              <span className="hidden text-muted md:block">{minutesAgo(o.paidAt)}</span>
              <span className="num text-right font-medium md:font-normal">{rupees(o.total)}</span>
              <span className="col-span-2 flex w-auto items-center justify-between gap-2 md:col-span-1 md:w-[132px]">
                <span className="text-[14px] text-muted md:hidden">
                  {pagesOf(o)} pages · {o.fulfillment === 'DELIVERY' ? 'delivery' : 'pickup'} · {minutesAgo(o.paidAt)}
                </span>
                {showAction && NEXT[o.status] ? (
                  <span className={cn('inline-flex h-8 items-center rounded-control px-3 text-[14px] font-medium', o.status === 'PAID' ? 'bg-primary text-on-primary' : 'border border-control')}>{NEXT[o.status]}</span>
                ) : (
                  <StatusBadge status={o.status} />
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const FILTERS = ['NEW', 'PRINTING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED', 'ALL'] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABEL: Record<Filter, string> = { NEW: 'To print', PRINTING: 'Printing', READY: 'Ready', OUT_FOR_DELIVERY: 'Out for delivery', COMPLETED: 'Collected', CANCELLED: 'Cancelled', ALL: 'All' };

/** Short beep using Web Audio, so no sound file is needed. */
function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    o.start();
    o.stop(ctx.currentTime + 0.35);
  } catch {
    /* audio blocked */
  }
}

function OrdersPanel() {
  const [filter, setFilter] = useState<Filter>('NEW');
  const [search, setSearch] = useState('');
  const [alerts, setAlerts] = useState(false);
  const known = useRef<Set<string> | null>(null);
  const q = useQuery({ queryKey: ['shop-orders', filter], queryFn: () => api.get<{ orders: Order[] }>(`/shop/orders?status=${filter}`), refetchInterval: 20_000 });
  const exportCsv = useMutation({ mutationFn: () => api.download('/shop/orders/export', 'orders.csv') });

  useEffect(() => {
    if (!q.data) return;
    const paid = q.data.orders.filter((o) => o.status === 'PAID');
    if (known.current && alerts) {
      const fresh = paid.filter((o) => !known.current!.has(o.id));
      if (fresh.length) {
        beep();
        if ('Notification' in window && Notification.permission === 'granted') new Notification('New PrintPoint order', { body: `${fresh.length} new paid order(s) to print` });
      }
    }
    known.current = new Set(paid.map((o) => o.id));
  }, [q.data, alerts]);

  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    const list = q.data?.orders ?? [];
    return t ? list.filter((o) => `${o.orderNumber} ${o.customer?.name} ${o.customer?.mobile}`.toLowerCase().includes(t)) : list;
  }, [q.data, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Order status">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={cn('h-8 rounded-control px-3 text-sm', filter === f ? 'bg-active font-medium text-ink' : 'text-muted hover:text-ink')}>
            {FILTER_LABEL[f]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:w-[300px]">
          <Input aria-label="Search orders" placeholder="Order no., name or mobile" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9" />
        </div>
        <div className="flex items-center gap-2">
          <span className="num text-sm text-muted">{rows.length} {rows.length === 1 ? 'order' : 'orders'}</span>
          <Button
            size="sm"
            aria-pressed={alerts}
            onClick={() => {
              setAlerts((a) => !a);
              if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
              beep();
            }}
          >
            {alerts ? 'Sound on' : 'Sound off'}
          </Button>
          <Button size="sm" loading={exportCsv.isPending} onClick={() => exportCsv.mutate()}>Export CSV</Button>
        </div>
      </div>
      {exportCsv.error && <ErrorState error={exportCsv.error} />}
      <Card flush className="pt-2">
        {q.isLoading ? (
          <div className="p-5"><Loading rows={5} /></div>
        ) : q.error ? (
          <div className="p-5"><ErrorState error={q.error} onRetry={() => void q.refetch()} /></div>
        ) : rows.length === 0 ? (
          <p className="m-5 rounded-control border border-dashed border-control px-4 py-3 text-sm text-muted">No {FILTER_LABEL[filter].toLowerCase()} orders{search ? ` matching "${search}"` : ''}.</p>
        ) : (
          <OrderTable orders={rows} showAction={filter !== 'ALL' && filter !== 'COMPLETED' && filter !== 'CANCELLED'} />
        )}
      </Card>
    </div>
  );
}

function Takings() {
  const [days, setDays] = useState<7 | 30>(30);
  const q = useQuery({ queryKey: ['shop-analytics', days], queryFn: () => api.get<AnalyticsData>(`/shop/analytics?days=${days}`) });
  if (q.isLoading) return <Loading rows={4} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const a = q.data!;
  return (
    <div className="space-y-4">
      <Card
        title={`Takings, last ${days} days`}
        action={
          <div className="inline-flex gap-1 rounded-control bg-active p-1">
            {([7, 30] as const).map((n) => (
              <button key={n} onClick={() => setDays(n)} aria-pressed={days === n} className={cn('rounded-[5px] px-3 py-1 text-sm', days === n ? 'bg-surface font-medium' : 'text-muted')}>
                {n} days
              </button>
            ))}
          </div>
        }
      >
        <div className="mb-4 grid grid-cols-3 gap-4 border-b border-line pb-4">
          <Figure label="Taken" value={rupees(a.totals.revenue)} lead />
          <Figure label="Paid orders" value={String(a.totals.orders)} />
          <Figure label="Average order" value={rupees(a.totals.averageOrderValue)} />
        </div>
        <Bars
          ariaLabel={`Takings per day for the last ${days} days; today is highlighted`}
          format={(v) => `₹${Math.round(v / 100).toLocaleString('en-IN')}`}
          data={a.series.map((s, i, all) => ({
            label: i === all.length - 1 ? 'Today' : new Date(s.date).toLocaleDateString('en-IN', days === 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' }),
            value: s.revenue,
            highlight: i === all.length - 1,
          }))}
        />
        <p className="mt-2 text-[14px] text-muted">Cancelled and refunded orders are left out of the takings.</p>
      </Card>
      <Card title="What sold">
        {a.topServices.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[14px] text-muted">
                <th className="pb-2 text-left font-normal">Service</th>
                <th className="pb-2 text-right font-normal">Units</th>
              </tr>
            </thead>
            <tbody>
              {a.topServices.map((s) => (
                <tr key={s.name} className="border-t border-rule">
                  <td className="py-2.5">{s.name}</td>
                  <td className="num py-2.5 text-right">{s.units.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">No sales in this period.</p>
        )}
      </Card>
    </div>
  );
}

interface ProfileResponse {
  shop: ShopProfile & { payoutUpiMasked: string | null; payoutAccountMasked: string | null; email: string | null; mapsUrl: string | null; services: ServiceType[] };
}

function ProfilePanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['shop-profile'], queryFn: () => api.get<ProfileResponse>('/shop/profile') });
  const m = useMutation({
    mutationFn: (p: ShopProfile) => api.put('/shop/profile', { ...p, email: p.email || null, mapsUrl: p.mapsUrl || null }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['shop-profile'] }),
  });
  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState error={q.error} />;
  const s = q.data!.shop;
  return (
    <Card>
      {m.isSuccess && <div className="mb-4"><Alert tone="green">Saved</Alert></div>}
      <ShopProfileForm
        initial={{ ...s, email: s.email ?? '', mapsUrl: s.mapsUrl ?? '', payoutUpi: '', payoutAccount: '' }}
        masked={{ upi: s.payoutUpiMasked, account: s.payoutAccountMasked }}
        submitLabel="Save shop details"
        busy={m.isPending}
        error={m.error}
        onSubmit={(p) => m.mutate(p)}
      />
    </Card>
  );
}
