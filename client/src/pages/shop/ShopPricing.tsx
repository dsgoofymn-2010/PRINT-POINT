import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DEFAULT_SETTINGS } from '@/lib/cart';
import { dateTime, rupees } from '@/lib/format';
import type { Pricing, PricingRule, PrintSettings, Quote } from '@/lib/types';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import { Alert, Badge, Button, Card, ErrorState, Input, Loading, PageTitle, Segmented, Select } from '@/components/ui';

type Form = Omit<Pricing, 'freeDeliveryAbove'> & { name: string; freeDeliveryAbove: number | null };

// Paise fields edited in rupees for shop owners.
const MONEY: { key: keyof Form; label: string; unit: string }[] = [
  { key: 'bwSingle', label: 'B/W single-side', unit: 'per page' },
  { key: 'bwDouble', label: 'B/W double-side', unit: 'per page' },
  { key: 'colorSingle', label: 'Colour single-side', unit: 'per page' },
  { key: 'colorDouble', label: 'Colour double-side', unit: 'per page' },
  { key: 'bondExtra', label: 'Bond 80 GSM extra', unit: 'per sheet' },
  { key: 'glossyExtra', label: 'Glossy paper extra', unit: 'per sheet' },
  { key: 'spiralBinding', label: 'Spiral binding', unit: 'per copy' },
  { key: 'softBinding', label: 'Soft binding', unit: 'per copy' },
  { key: 'hardBinding', label: 'Hard binding', unit: 'per copy' },
  { key: 'laminationSingle', label: 'Lamination single-side', unit: 'per sheet' },
  { key: 'laminationDouble', label: 'Lamination double-side', unit: 'per sheet' },
  { key: 'deliveryFee', label: 'Delivery fee', unit: 'per order' },
  { key: 'minOrderAmount', label: 'Minimum order', unit: 'per order' },
];

const toForm = (r: PricingRule): Form => ({ ...r });
const blank: Form = {
  name: 'New price list', bwSingle: 150, bwDouble: 100, colorSingle: 1000, colorDouble: 800, a3Multiplier: 2, legalMultiplier: 1.2, bondExtra: 0, glossyExtra: 0,
  spiralBinding: 0, softBinding: 0, hardBinding: 0, laminationSingle: 0, laminationDouble: 0, deliveryFee: 0, freeDeliveryAbove: null, minOrderAmount: 0, taxPercent: 0,
};
const payload = (f: Form) => {
  const { name, ...rest } = f;
  const out: Record<string, unknown> = { name };
  for (const [k, v] of Object.entries(rest)) out[k] = v;
  return out;
};

export default function ShopPricing() {
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: ['pricing'], queryFn: () => api.get<{ rules: PricingRule[] }>('/shop/pricing') });
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [pct, setPct] = useState(10);
  const [preview, setPreview] = useState<{ pages: number; settings: PrintSettings }>({ pages: 20, settings: { ...DEFAULT_SETTINGS } });

  useEffect(() => {
    if (!rules.data || selected) return;
    const active = rules.data.rules.find((r) => r.isActive) ?? rules.data.rules[0];
    if (active) {
      setSelected(active.id);
      setForm(toForm(active));
    } else {
      setSelected('new');
      setForm(blank);
    }
  }, [rules.data, selected]);

  const refresh = () => void qc.invalidateQueries({ queryKey: ['pricing'] });
  const save = useMutation({
    mutationFn: () => (selected === 'new' ? api.post<{ rule: PricingRule }>('/shop/pricing', payload(form!)) : api.put<{ rule: PricingRule }>(`/shop/pricing/${selected}`, payload(form!))),
    onSuccess: (r) => {
      setSelected(r.rule.id);
      refresh();
    },
  });
  const activate = useMutation({ mutationFn: (id: string) => api.post(`/shop/pricing/${id}/activate`), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/shop/pricing/${id}`),
    onSuccess: () => {
      setSelected(null);
      refresh();
    },
  });
  const bulk = useMutation({
    mutationFn: () => api.post<{ rule: PricingRule }>(`/shop/pricing/${selected}/bulk`, { percent: pct, scope: 'PER_PAGE' }),
    onSuccess: (r) => {
      setForm(toForm(r.rule));
      refresh();
    },
  });

  const previewQ = useQuery({
    queryKey: ['pricing-preview', form, preview],
    queryFn: () => api.post<{ quote: Quote }>('/shop/pricing/preview', { rule: payload(form!), pages: preview.pages, settings: { ...preview.settings, pageRange: null } }).then((r) => r.quote),
    enabled: !!form,
    retry: false,
  });

  if (rules.isLoading || !form) return <Loading />;
  if (rules.error) return <ErrorState error={rules.error} />;
  const current = rules.data?.rules.find((r) => r.id === selected);
  const setMoney = (k: keyof Form, rupeesValue: string) => setForm((f) => (f ? { ...f, [k]: Math.max(0, Math.round(Number(rupeesValue || 0) * 100)) } : f));
  const err = save.error ?? activate.error ?? remove.error ?? bulk.error;

  return (
    <div>
      <PageTitle title="Pricing" subtitle="Changes apply to new orders only. Paid orders keep the price they were charged." />
      <div className="mb-4 flex flex-wrap gap-2">
        {rules.data?.rules.map((r) => (
          <button key={r.id} onClick={() => { setSelected(r.id); setForm(toForm(r)); }} className={`rounded-full border px-3 py-1.5 text-sm ${selected === r.id ? 'border-ink bg-active ' : 'border-line '}`}>
            {r.name} {r.isActive && <Badge tone="green">Active</Badge>}
          </button>
        ))}
        <button onClick={() => { setSelected('new'); setForm(blank); }} className="rounded-full border border-dashed border-line px-3 py-1.5 text-sm">+ New price list</button>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <Input label="Price list name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              {MONEY.map((m) => (
                <Input key={m.key} label={`${m.label} (₹ ${m.unit})`} type="number" step="0.01" min={0} inputMode="decimal" value={(form[m.key] as number) / 100} onChange={(e) => setMoney(m.key, e.target.value)} />
              ))}
              <Input label="Free delivery above (₹, optional)" type="number" step="1" min={0} value={form.freeDeliveryAbove != null ? form.freeDeliveryAbove / 100 : ''} onChange={(e) => setForm({ ...form, freeDeliveryAbove: e.target.value ? Math.round(Number(e.target.value) * 100) : null })} />
              <Input label="A3 multiplier (× A4)" type="number" step="0.1" min={1} value={form.a3Multiplier} onChange={(e) => setForm({ ...form, a3Multiplier: Number(e.target.value) })} />
              <Input label="Legal multiplier (× A4)" type="number" step="0.1" min={1} value={form.legalMultiplier} onChange={(e) => setForm({ ...form, legalMultiplier: Number(e.target.value) })} />
              <Input label="Tax %" type="number" step="0.5" min={0} max={28} value={form.taxPercent} onChange={(e) => setForm({ ...form, taxPercent: Number(e.target.value) })} />
            </div>
            {err && <ErrorState error={err} />}
            {save.isSuccess && <Alert tone="green">Saved</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" type="submit" loading={save.isPending}>{selected === 'new' ? 'Create' : 'Save changes'}</Button>
              {current && !current.isActive && <Button type="button" variant="secondary" loading={activate.isPending} onClick={() => activate.mutate(current.id)}>Make active</Button>}
              {current && !current.isActive && <Button type="button" variant="danger" loading={remove.isPending} onClick={() => remove.mutate(current.id)}>Delete</Button>}
            </div>
            {current && <p className="text-xs text-muted">Last updated {dateTime(current.updatedAt)}</p>}
          </form>
          {current && (
            <div className="mt-6 border-t border-line pt-4">
              <h3 className="mb-2 font-semibold">Bulk update per-page prices</h3>
              <div className="flex items-end gap-2">
                <Input label="Change by %" type="number" value={pct} onChange={(e) => setPct(Number(e.target.value))} hint="Use a negative number to reduce prices" />
                <Button type="button" variant="secondary" loading={bulk.isPending} onClick={() => bulk.mutate()}>Apply</Button>
              </div>
            </div>
          )}
        </Card>
        <Card className="lg:sticky lg:top-20 lg:self-start">
          <h2 className="mb-3 font-semibold">Customer preview</h2>
          <div className="mb-4 space-y-3">
            <Input label="Pages" type="number" min={1} value={preview.pages} onChange={(e) => setPreview((p) => ({ ...p, pages: Math.max(1, Number(e.target.value) || 1) }))} />
            <Segmented label="Type" name="pv-color" value={preview.settings.color} onChange={(v) => setPreview((p) => ({ ...p, settings: { ...p.settings, color: v } }))} options={[{ value: 'BW', label: 'B/W' }, { value: 'COLOR', label: 'Colour' }]} />
            <Segmented label="Sides" name="pv-sides" value={preview.settings.sides} onChange={(v) => setPreview((p) => ({ ...p, settings: { ...p.settings, sides: v } }))} options={[{ value: 'SINGLE', label: 'Single' }, { value: 'DOUBLE', label: 'Double' }]} />
            <Select label="Binding" value={preview.settings.binding} onChange={(e) => setPreview((p) => ({ ...p, settings: { ...p.settings, binding: e.target.value as PrintSettings['binding'] } }))} options={[{ value: 'NONE', label: 'None' }, { value: 'SPIRAL', label: 'Spiral' }, { value: 'SOFT', label: 'Soft' }, { value: 'HARD', label: 'Hard' }]} />
          </div>
          {previewQ.data ? <PriceBreakdown quote={previewQ.data} /> : previewQ.error ? <ErrorState error={previewQ.error} /> : <Loading />}
          <p className="mt-3 text-xs text-muted">Example: {preview.pages} pages B/W single = {rupees(preview.pages * form.bwSingle)}</p>
        </Card>
      </div>
    </div>
  );
}
