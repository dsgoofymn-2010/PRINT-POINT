import { useMemo } from 'react';
import type { CartItem } from '@/lib/cart';
import type { PrintSettings } from '@/lib/types';
import { Input, Segmented, Select } from './ui';

/** Client-side mirror of the server's page-range rules, for instant feedback. */
export function pageRangeError(expr: string, total: number | null): string | null {
  if (!expr.trim() || !total) return null;
  for (const part of expr.split(',')) {
    const p = part.trim();
    if (!p) continue;
    const m = /^(\d+)(?:\s*-\s*(\d+|end))?$/i.exec(p);
    if (!m) return `"${p}" is not a valid range`;
    const a = Number(m[1]);
    const b = m[2] ? (m[2].toLowerCase() === 'end' ? total : Number(m[2])) : a;
    if (a < 1 || b < a) return `"${p}" is not a valid range`;
    if (b > total) return `Page ${b} is beyond the last page (${total})`;
  }
  return null;
}

interface Props {
  item: CartItem;
  services: Set<string>;
  onChange: (patch: Partial<PrintSettings>, pagesOverride?: number) => void;
}

export function ItemSettings({ item, services, onChange }: Props) {
  const s = item.settings;
  const rangeErr = useMemo(() => pageRangeError(s.pageRange, item.pageCount ?? item.pagesOverride ?? null), [s.pageRange, item.pageCount, item.pagesOverride]);
  const n = (id: string) => `${item.fileId}-${id}`;
  const hasBinding = services.has('SPIRAL_BINDING') || services.has('SOFT_BINDING') || services.has('HARD_BINDING');

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {item.pageCount == null && (
        <Input
          label="Number of pages"
          type="number"
          min={1}
          inputMode="numeric"
          value={item.pagesOverride ?? ''}
          onChange={(e) => onChange({}, Math.max(1, Number(e.target.value) || 1))}
          hint="We couldn't read the page count. The shop will verify it."
        />
      )}
      <Segmented
        label="Print type"
        name={n('color')}
        value={s.color}
        onChange={(v) => onChange({ color: v })}
        options={[{ value: 'BW', label: 'Black & White' }, ...(services.has('COLOR_PRINT') ? [{ value: 'COLOR' as const, label: 'Colour' }] : [])]}
      />
      <Segmented label="Sides" name={n('sides')} value={s.sides} onChange={(v) => onChange({ sides: v })} options={[{ value: 'SINGLE', label: 'Single-sided' }, { value: 'DOUBLE', label: 'Double-sided' }]} />
      <Segmented label="Paper size" name={n('size')} value={s.paperSize} onChange={(v) => onChange({ paperSize: v })} options={[{ value: 'A4', label: 'A4' }, { value: 'A3', label: 'A3' }, { value: 'LEGAL', label: 'Legal' }]} />
      <Select
        label="Paper quality"
        value={s.paperQuality}
        onChange={(e) => onChange({ paperQuality: e.target.value as PrintSettings['paperQuality'] })}
        options={[{ value: 'NORMAL_70', label: 'Normal 70 GSM' }, { value: 'BOND_80', label: 'Bond 80 GSM' }, { value: 'GLOSSY', label: 'Glossy' }]}
      />
      <div className="flex items-end gap-2">
        <Input label="Copies" type="number" min={1} max={500} inputMode="numeric" value={s.copies} onChange={(e) => onChange({ copies: Math.min(500, Math.max(1, Number(e.target.value) || 1)) })} />
        <button type="button" aria-label="One less copy" className="mb-0.5 h-10 w-10 rounded-control border border-line" onClick={() => onChange({ copies: Math.max(1, s.copies - 1) })}>−</button>
        <button type="button" aria-label="One more copy" className="mb-0.5 h-10 w-10 rounded-control border border-line" onClick={() => onChange({ copies: Math.min(500, s.copies + 1) })}>+</button>
      </div>
      <Input label="Page range" placeholder="All pages, e.g. 1-10, 15, 20-end" value={s.pageRange} onChange={(e) => onChange({ pageRange: e.target.value })} error={rangeErr ?? undefined} />
      <Segmented label="Orientation" name={n('orient')} value={s.orientation} onChange={(v) => onChange({ orientation: v })} options={[{ value: 'PORTRAIT', label: 'Portrait' }, { value: 'LANDSCAPE', label: 'Landscape' }]} />
      <Segmented label="Scaling" name={n('fit')} value={s.fitMode} onChange={(v) => onChange({ fitMode: v })} options={[{ value: 'FIT', label: 'Fit to page' }, { value: 'ACTUAL', label: 'Actual size' }]} />
      {hasBinding && (
        <Select
          label="Binding"
          value={s.binding}
          onChange={(e) => onChange({ binding: e.target.value as PrintSettings['binding'] })}
          options={[
            { value: 'NONE', label: 'No binding' },
            ...(services.has('SPIRAL_BINDING') ? [{ value: 'SPIRAL', label: 'Spiral binding' }] : []),
            ...(services.has('SOFT_BINDING') ? [{ value: 'SOFT', label: 'Soft binding' }] : []),
            ...(services.has('HARD_BINDING') ? [{ value: 'HARD', label: 'Hard binding' }] : []),
          ]}
        />
      )}
      {services.has('LAMINATION') && (
        <Select
          label="Lamination"
          value={s.lamination}
          onChange={(e) => onChange({ lamination: e.target.value as PrintSettings['lamination'] })}
          options={[{ value: 'NONE', label: 'None' }, { value: 'SINGLE', label: 'Single-side' }, { value: 'DOUBLE', label: 'Double-side' }]}
        />
      )}
    </div>
  );
}
