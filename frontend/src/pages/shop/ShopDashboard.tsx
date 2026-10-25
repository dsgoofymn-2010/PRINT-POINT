import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { rupees } from '@/lib/format';
import type { Order, ServiceType } from '@/lib/types';
import { Bars } from '@/components/Bars';
import { Alert, ButtonLink, Card, EmptyState, ErrorState, Loading, PageTitle, Tabs, cn } from '@/components/ui';
import { ShopProfileForm, type ShopProfile } from './ShopProfileForm';

/*
  Shop desk, style "Achromatic ledger" (seed 1499594586).
  Screen question: what have we taken, and are our shop details right?
  Live requests are handled on the /owner desk.
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

type Tab = 'sales' | 'profile';

export default function ShopDashboard() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'profile' ? 'profile' : 'sales';
  const setTab = (t: Tab) => setParams({ tab: t });
  const dash = useQuery({ queryKey: ['shop-dashboard'], queryFn: () => api.get<Dashboard>('/shop/dashboard') });

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
      <PageTitle title={{ sales: 'Takings', profile: 'Shop details' }[tab]} subtitle={d.shop.name} action={<ButtonLink variant="primary" to="/owner">Open requests desk</ButtonLink>} />
      <div className="mb-6">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'sales', label: 'Takings' }, { value: 'profile', label: 'Shop details' }]} />
      </div>
      {tab === 'sales' && <Takings />}
      {tab === 'profile' && <ProfilePanel />}
    </div>
  );
}

function Figure({ label, value, lead }: { label: string; value: string; lead?: boolean }) {
  return (
    <div>
      <p className="text-[0.875rem] text-muted">{label}</p>
      <p className={cn('num mt-0.5 leading-tight', lead ? 'text-[1.875rem] font-semibold' : 'text-2xl')}>{value}</p>
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
        <p className="mt-2 text-[0.875rem] text-muted">Cancelled and refunded orders are left out of the takings.</p>
      </Card>
      <Card title="What sold">
        {a.topServices.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[0.875rem] text-muted">
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
