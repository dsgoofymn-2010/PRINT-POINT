import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { dateTime, rupees, SERVICE_LABEL, time12 } from '@/lib/format';
import type { ShopDetail } from '@/lib/types';
import { Badge, ButtonLink, Card, ErrorState, Loading, PageTitle } from '@/components/ui';

/* Detail screen: what does this shop charge, and can it print my job now? */

export default function ShopDetailPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['shop', id], queryFn: () => api.get<{ shop: ShopDetail }>(`/shops/${id}`) });
  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const shop = q.data!.shop;
  const p = shop.pricing;
  const address = shop.address.toLowerCase().includes(shop.area.toLowerCase()) ? shop.address : `${shop.address}, ${shop.area}`;

  const groups: { title: string; rows: [string, string, string?][] }[] = p
    ? [
        {
          title: 'Printing, per page',
          rows: [
            ['Black & white, single-sided', rupees(p.bwSingle)],
            ['Black & white, double-sided', rupees(p.bwDouble)],
            ['Colour, single-sided', rupees(p.colorSingle)],
            ['Colour, double-sided', rupees(p.colorDouble)],
            ['A3', `${p.a3Multiplier}× the A4 price`],
            ['Legal', `${p.legalMultiplier}× the A4 price`],
          ],
        },
        {
          title: 'Paper, binding and finishing',
          rows: [
            ['Bond 80 GSM paper', `+${rupees(p.bondExtra)}`, 'a sheet'],
            ['Glossy paper', `+${rupees(p.glossyExtra)}`, 'a sheet'],
            ['Spiral binding', rupees(p.spiralBinding), 'a copy'],
            ['Soft binding', rupees(p.softBinding), 'a copy'],
            ['Hard binding', rupees(p.hardBinding), 'a copy'],
            ['Lamination, one side', rupees(p.laminationSingle), 'a sheet'],
            ['Lamination, both sides', rupees(p.laminationDouble), 'a sheet'],
          ],
        },
        {
          title: 'Order',
          rows: [
            ['Minimum order', rupees(p.minOrderAmount)],
            ['Delivery', shop.deliveryAvailable ? rupees(p.deliveryFee) : '—', shop.deliveryAvailable && p.freeDeliveryAbove ? `free over ${rupees(p.freeDeliveryAbove)}` : undefined],
            ['Tax', p.taxPercent ? `${p.taxPercent}%` : 'Included'],
          ],
        },
      ]
    : [];

  return (
    <div>
      <PageTitle
        title={shop.name}
        subtitle={`${address}, ${shop.city} ${shop.pincode}`}
        action={<ButtonLink variant="primary" size="lg" to={`/print/${shop.id}`}>Upload &amp; print here</ButtonLink>}
      />
      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <Badge tone={shop.isOpen ? 'green' : 'gray'}>{shop.isOpen ? 'Open now' : 'Closed now'}</Badge>
        <span>
          {time12(shop.openTime)} to {time12(shop.closeTime)}
          {shop.holidays.length > 0 && `, closed ${shop.holidays.map((d) => d[0] + d.slice(1).toLowerCase()).join(', ')}`}
        </span>
        <span className="text-muted">Ready in about {shop.estimatedPickupMins} minutes</span>
        <span className="text-muted">{shop.deliveryAvailable ? `Delivers within ${shop.deliveryRadiusKm} km` : 'Pickup only'}</span>
        <span className="num text-muted">{shop.ratingCount ? `Rated ${shop.rating.toFixed(1)} of 5 by ${shop.ratingCount} ${shop.ratingCount === 1 ? 'customer' : 'customers'}` : 'No ratings yet'}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Price list">
          {p ? (
            <div className="space-y-6">
              {groups.map((g) => (
                <table key={g.title} className="w-full text-sm">
                  <caption className="pb-1 text-left text-[14px] text-muted">{g.title}</caption>
                  <tbody>
                    {g.rows.map(([k, v, unit]) => (
                      <tr key={k} className="border-t border-rule">
                        <th scope="row" className="py-2 pr-3 text-left font-normal">{k}</th>
                        <td className="num py-2 text-right">
                          {v}
                          {unit && <span className="ml-1 text-muted">{unit}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">This shop has not published prices yet.</p>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Services">
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {shop.services.map((s) => (
                <li key={s.type}>{SERVICE_LABEL[s.type]}</li>
              ))}
            </ul>
          </Card>
          <Card title="Find the shop">
            <p className="text-sm">
              {address}, {shop.city} {shop.pincode}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {shop.mapsUrl && (
                <a href={shop.mapsUrl} target="_blank" rel="noreferrer noopener" className="inline-flex h-9 items-center rounded-control border border-control px-3 text-sm hover:bg-raised">
                  Open in Google Maps
                </a>
              )}
              <a href={`tel:${shop.mobile}`} className="inline-flex h-9 items-center rounded-control border border-control px-3 text-sm hover:bg-raised">
                Call {shop.mobile}
              </a>
            </div>
          </Card>
          <Card title={<>Reviews <span className="num font-normal text-muted">{shop.reviews.length}</span></>} className="flex-1">
            {shop.reviews.length ? (
              <ul className="space-y-4">
                {shop.reviews.slice(0, 4).map((r) => (
                  <li key={r.id} className="text-sm">
                    <p>
                      <span className="num font-medium">{r.rating} of 5</span> <span className="text-muted">· {r.customer.name} · {dateTime(r.createdAt)}</span>
                    </p>
                    {r.comment && <p className="mt-0.5">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No reviews yet. Customers can review after they collect an order.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
