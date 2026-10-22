import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { rupees, SERVICE_LABEL, time12 } from '@/lib/format';
import type { ShopSummary } from '@/lib/types';
import { Badge, EmptyState, ErrorState, Input, Loading, PageTitle, Select, cn } from '@/components/ui';

/* List screen: which shop near me can print this now, and for how much? */

const TOGGLES = [
  { key: 'openNow', label: 'Open now' },
  { key: 'delivery', label: 'Delivers' },
  { key: 'color', label: 'Colour' },
  { key: 'binding', label: 'Binding' },
] as const;

export default function Shops() {
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const query = new URLSearchParams(params);
  if (!query.get('city')) query.set('city', 'Chennai');

  const areas = useQuery({ queryKey: ['areas'], queryFn: () => api.get<{ areas: { city: string; area: string }[] }>('/shops/areas') });
  const shops = useQuery({ queryKey: ['shops', query.toString()], queryFn: () => api.get<{ shops: ShopSummary[] }>(`/shops?${query.toString()}`) });
  const list = shops.data?.shops ?? [];
  const openCount = list.filter((s) => s.isOpen).length;

  return (
    <div>
      <PageTitle
        title="Xerox shops in Chennai"
        subtitle={shops.data ? `${list.length} ${list.length === 1 ? 'shop' : 'shops'} · ${openCount} open now. Prices are each shop's own, per printed page.` : ' '}
      />

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-[300px]">
          <Input aria-label="Search shops" placeholder="Shop name or area" value={params.get('q') ?? ''} onChange={(e) => set('q', e.target.value)} className="h-9" />
        </div>
        <div className="w-[calc(50%-6px)] sm:w-48">
          <Select
            aria-label="Area"
            value={params.get('area') ?? ''}
            onChange={(e) => set('area', e.target.value)}
            className="h-9"
            options={[{ value: '', label: 'All areas' }, ...(areas.data?.areas ?? []).map((a) => ({ value: a.area, label: a.area }))]}
          />
        </div>
        <div className="w-[calc(50%-6px)] sm:w-40">
          <Select
            aria-label="Rating"
            value={params.get('minRating') ?? ''}
            onChange={(e) => set('minRating', e.target.value)}
            className="h-9"
            options={[{ value: '', label: 'Any rating' }, { value: '4', label: '4.0 and up' }, { value: '4.5', label: '4.5 and up' }]}
          />
        </div>
      </div>
      <div className="mb-6 flex flex-wrap gap-1.5" role="group" aria-label="Filters">
        {TOGGLES.map((t) => {
          const on = params.get(t.key) === 'true';
          return (
            <button key={t.key} aria-pressed={on} onClick={() => set(t.key, on ? null : 'true')} className={cn('h-8 rounded-control border px-3 text-sm transition-colors', on ? 'border-ink bg-active font-medium' : 'border-control text-muted hover:text-ink')}>
              {t.label}
            </button>
          );
        })}
      </div>

      {shops.isLoading ? (
        <Loading label="Finding shops" rows={4} />
      ) : shops.error ? (
        <ErrorState error={shops.error} onRetry={() => void shops.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState title="No shops match these filters" body="Remove a filter or pick another area." />
      ) : (
        <div className="rounded-card border border-line bg-surface">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_1.3fr_0.8fr_0.8fr_0.6fr_auto] gap-4 px-5 py-3 text-[14px] text-muted md:grid">
            <span>Shop</span>
            <span>Hours</span>
            <span className="text-right">B/W a page</span>
            <span className="text-right">Min. order</span>
            <span className="text-right">Rating</span>
            <span className="w-[120px]" />
          </div>
          <ul>
            {list.map((s) => (
              <li key={s.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-t border-rule px-5 py-4 first:border-t-0 md:grid-cols-[minmax(0,2.2fr)_1.3fr_0.8fr_0.8fr_0.6fr_auto] md:first:border-t">
                <div className="min-w-0">
                  <Link to={`/shops/${s.slug}`} className="font-medium hover:underline">{s.name}</Link>
                  <p className="text-[14px] text-muted">
                    {s.area} · {[s.deliveryAvailable && 'delivers', ...s.services.filter((x) => ['COLOR_PRINT', 'SPIRAL_BINDING', 'HARD_BINDING'].includes(x.type)).map((x) => SERVICE_LABEL[x.type].toLowerCase())].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="hidden text-sm md:block">
                  <Badge tone={s.isOpen ? 'green' : 'gray'}>{s.isOpen ? 'Open' : 'Closed'}</Badge>
                  <span className="ml-2 text-muted">{s.isOpen ? `till ${time12(s.closeTime)}` : `opens ${time12(s.openTime)}`}</span>
                </div>
                <span className="num text-right font-medium md:font-normal">{s.startingPrice != null ? rupees(s.startingPrice) : '—'}</span>
                <span className="num hidden text-right text-muted md:block">{s.minOrderAmount ? rupees(s.minOrderAmount) : '—'}</span>
                <span className="num hidden text-right md:block">{s.ratingCount ? s.rating.toFixed(1) : '—'}</span>
                <div className="col-span-2 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 md:col-span-1 md:w-[120px] md:justify-end">
                  <span className="text-[14px] text-muted md:hidden">
                    {s.isOpen ? `Open till ${time12(s.closeTime)}` : `Opens ${time12(s.openTime)}`} · ready in ~{s.estimatedPickupMins} min
                  </span>
                  <Link to={`/print/${s.id}`} className="inline-flex h-8 items-center whitespace-nowrap rounded-control bg-primary px-3 text-[14px] font-medium text-on-primary hover:opacity-90">
                    Upload &amp; print
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
