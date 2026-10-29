import { time12, STATUS_LABEL } from '@/lib/format';
import { useMainShop } from '@/lib/mainShop';
import { Badge } from '../ui';
import { Tilt } from '../Tilt';
import { isActive, useMyRequests } from './MyRequests';

/** Beside "My requests": what a customer needs to collect, not the queue and prices. */
export function PickupPanel({ onNew }: { onNew: () => void }) {
  const shop = useMainShop().data;
  const mine = useMyRequests().data ?? [];
  const codes = mine.filter((o) => isActive(o) && o.pickupOtp);
  const ready = codes.filter((o) => o.status === 'READY').length;

  const body = (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold">Your pickup codes</h3>
        {codes.length ? (
          <ul className="mt-2 space-y-2">
            {codes.map((o) => (
              <li key={o.id}>
                <Tilt>
                  <div className="flex items-center justify-between gap-3 rounded-control border border-ink bg-surface px-3 py-2 shadow-[3px_3px_0_rgb(var(--yellow))]">
                    <span className="num display text-[1.5rem] leading-none tracking-[0.08em]">{o.pickupOtp}</span>
                    <Badge tone={o.status === 'READY' ? 'green' : 'yellow'}>{STATUS_LABEL[o.status]}</Badge>
                  </div>
                </Tilt>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[1rem] text-muted">You get a code once the shop accepts a request.</p>
        )}
        {ready > 0 && <p className="mt-2 text-[1rem] font-medium">{ready === 1 ? 'Your print is ready.' : `${ready} prints are ready.`} Show the code at the counter.</p>}
      </div>

      {shop && (
        <div className="space-y-2">
          <h3 className="font-semibold">Collect from</h3>
          <p className="flex flex-wrap items-center gap-2 text-[1rem]">
            <Badge tone={shop.isOpen ? 'green' : 'red'}>{shop.isOpen ? 'Open now' : 'Closed'}</Badge>
            <span className="text-muted">{time12(shop.openTime)} – {time12(shop.closeTime)}</span>
          </p>
          <p className="text-[1rem]">{shop.address}, {shop.area}, {shop.city} {shop.pincode}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {shop.mapsUrl && (
              <a href={shop.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center rounded-control bg-primary px-4 text-[1rem] font-medium text-on-primary transition-opacity hover:opacity-90">
                Get directions
              </a>
            )}
            <a href={`tel:${shop.mobile}`} className="inline-flex min-h-[44px] items-center rounded-control border border-control px-4 text-[1rem] font-medium hover:bg-active">
              Call the shop
            </a>
          </div>
        </div>
      )}

      <button type="button" onClick={onNew} className="w-full cursor-pointer rounded-control border border-control py-3 text-[1rem] font-medium transition-colors hover:bg-active">
        New request
      </button>
    </div>
  );

  return (
    <>
      <div className="mb-4 rounded-card border border-line bg-surface p-4 lg:hidden">{body}</div>
      <aside className="hidden lg:col-start-2 lg:row-start-1 lg:block" aria-label="Pickup">
        <div className="sticky top-24 rounded-card border border-line bg-raised p-5">{body}</div>
      </aside>
    </>
  );
}
