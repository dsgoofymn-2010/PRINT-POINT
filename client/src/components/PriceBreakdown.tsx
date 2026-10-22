import { rupees } from '@/lib/format';
import type { Quote } from '@/lib/types';

export function PriceBreakdown({ quote, compact }: { quote: Quote; compact?: boolean }) {
  return (
    <div className="space-y-3 text-sm">
      {!compact &&
        quote.items.map((i) => (
          <div key={i.key} className="rounded-control bg-raised p-3">
            <p className="truncate font-medium" title={i.fileName}>{i.fileName}</p>
            <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-muted">
              <dt>
                {i.printedPages} pages × {i.copies} {i.copies > 1 ? 'copies' : 'copy'} × {rupees(i.ratePerPage)}
                {i.sizeMultiplier !== 1 ? ` × ${i.sizeMultiplier}` : ''}
              </dt>
              <dd className="text-right tabular-nums">{rupees(i.printCost)}</dd>
              {i.paperExtra > 0 && (<><dt>Paper upgrade</dt><dd className="text-right tabular-nums">{rupees(i.paperExtra)}</dd></>)}
              {i.bindingCost > 0 && (<><dt>Binding</dt><dd className="text-right tabular-nums">{rupees(i.bindingCost)}</dd></>)}
              {i.laminationCost > 0 && (<><dt>Lamination ({i.sheets} sheets)</dt><dd className="text-right tabular-nums">{rupees(i.laminationCost)}</dd></>)}
            </dl>
          </div>
        ))}
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
        <dt>Subtotal</dt>
        <dd className="text-right tabular-nums">{rupees(quote.subtotal)}</dd>
        {quote.deliveryFee > 0 && (<><dt>Delivery</dt><dd className="text-right tabular-nums">{rupees(quote.deliveryFee)}</dd></>)}
        {quote.discount > 0 && (<><dt className="text-positive">Discount ({quote.couponCode})</dt><dd className="text-right tabular-nums text-positive">− {rupees(quote.discount)}</dd></>)}
        {quote.tax > 0 && (<><dt>Tax ({quote.taxPercent}%)</dt><dd className="text-right tabular-nums">{rupees(quote.tax)}</dd></>)}
        <dt className="border-t border-line pt-2 text-base font-semibold">Total</dt>
        <dd className="border-t border-line pt-2 text-right text-base font-semibold tabular-nums">{rupees(quote.total)}</dd>
      </dl>
      {!quote.meetsMinimum && (
        <p className="rounded-control bg-[#fffbeb] p-2 text-[#92400e]" role="status">
          Minimum order at this shop is {rupees(quote.minOrderAmount)}. Add more pages or copies.
        </p>
      )}
    </div>
  );
}
