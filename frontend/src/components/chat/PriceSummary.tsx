import { rupees } from '@/lib/format';
import type { ChatOptions, Quote } from '@/lib/types';

export interface Rates {
  bwSingle: number;
  bwDouble: number;
  colorSingle: number;
  colorDouble: number;
  spiralBinding: number;
  taxPercent: number;
}

export const rateName = (o: Pick<ChatOptions, 'color' | 'sides'>) =>
  `${o.color === 'COLOR' ? 'Colour' : 'B/W'} ${o.sides === 'DOUBLE' ? 'double-sided' : 'single-sided'} rate`;

/**
 * Every line shows the rate it used, and the lines add up to the total:
 * Σ(print + binding) = subtotal; subtotal + tax = total.
 */
export function PriceSummary({ quote, options }: { quote: Quote; options: ChatOptions }) {
  const lines = quote.items.flatMap((i) => {
    const out = [
      {
        key: `${i.key}-print`,
        label: (
          <>
            <span className="block truncate font-medium text-ink" title={i.fileName}>{i.fileName}</span>
            <span className="num">
              {i.printedPages} page{i.printedPages === 1 ? '' : 's'} × {i.copies} cop{i.copies === 1 ? 'y' : 'ies'} × {rupees(i.ratePerPage)}
            </span>{' '}
            <span>({rateName(options)})</span>
          </>
        ),
        amount: i.printCost,
      },
    ];
    if (i.bindingCost > 0) {
      out.push({
        key: `${i.key}-bind`,
        label: (
          <span className="num">
            Spiral binding × {i.copies} cop{i.copies === 1 ? 'y' : 'ies'} × {rupees(i.bindingCost / i.copies)}
          </span>
        ),
        amount: i.bindingCost,
      });
    }
    // Paper / lamination extras are not offered in the chat, but show them if a rule ever adds them.
    const extra = i.paperExtra + i.laminationCost;
    if (extra > 0) out.push({ key: `${i.key}-extra`, label: <span>Paper and finishing extras</span>, amount: extra });
    return out;
  });

  return (
    <div className="rounded-card border border-line bg-surface">
      <dl className="divide-y divide-rule px-4">
        {lines.map((l) => (
          <div key={l.key} className="flex items-baseline justify-between gap-4 py-2.5 text-[1rem] text-muted">
            <dt className="min-w-0">{l.label}</dt>
            <dd className="num whitespace-nowrap text-ink">{rupees(l.amount)}</dd>
          </div>
        ))}
        {quote.tax > 0 && (
          <>
            <div className="flex items-baseline justify-between gap-4 py-2.5 text-[1rem] text-muted">
              <dt>Subtotal</dt>
              <dd className="num text-ink">{rupees(quote.subtotal)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-2.5 text-[1rem] text-muted">
              <dt>Tax ({quote.taxPercent}%)</dt>
              <dd className="num text-ink">{rupees(quote.tax)}</dd>
            </div>
          </>
        )}
      </dl>
      <div className="flex items-baseline justify-between gap-4 border-t border-ink px-4 py-3">
        <span className="text-[1.125rem] font-semibold">Total</span>
        <span className="num display text-[2.125rem] leading-none">{rupees(quote.total)}</span>
      </div>
      {!quote.meetsMinimum && (
        <p className="border-t border-line px-4 py-2.5 text-[0.9375rem] text-negative">
          This shop’s minimum order is {rupees(quote.minOrderAmount)}. Add copies or files to send it.
        </p>
      )}
    </div>
  );
}
