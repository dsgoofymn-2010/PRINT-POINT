import { useState, type FormEvent } from 'react';
import { ALL_SERVICES, SERVICE_LABEL } from '@/lib/format';
import type { ServiceType } from '@/lib/types';
import { Button, ErrorState, Input } from '@/components/ui';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export interface ShopProfile {
  name: string;
  ownerName: string;
  mobile: string;
  email: string;
  address: string;
  area: string;
  city: string;
  pincode: string;
  mapsUrl: string;
  openTime: string;
  closeTime: string;
  holidays: string[];
  services: ServiceType[];
  deliveryAvailable: boolean;
  deliveryRadiusKm: number;
  estimatedPickupMins: number;
  payoutUpi?: string;
  payoutAccount?: string;
}

export const emptyProfile: ShopProfile = {
  name: '', ownerName: '', mobile: '', email: '', address: '', area: '', city: 'Chennai', pincode: '', mapsUrl: '',
  openTime: '09:00', closeTime: '21:00', holidays: [], services: ['XEROX_BW'], deliveryAvailable: false, deliveryRadiusKm: 0, estimatedPickupMins: 30,
};

interface Props {
  initial: ShopProfile;
  masked?: { upi?: string | null; account?: string | null };
  submitLabel: string;
  busy: boolean;
  error: unknown;
  onSubmit: (p: ShopProfile) => void;
}

export function ShopProfileForm({ initial, masked, submitLabel, busy, error, onSubmit }: Props) {
  const [f, setF] = useState<ShopProfile>(initial);
  const set = (k: keyof ShopProfile) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const toggle = <K extends 'holidays' | 'services'>(k: K, v: ShopProfile[K][number]) =>
    setF((p) => ({ ...p, [k]: (p[k] as string[]).includes(v) ? (p[k] as string[]).filter((x) => x !== v) : [...(p[k] as string[]), v] }));

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit({ ...f, email: f.email || '', payoutUpi: f.payoutUpi || undefined, payoutAccount: f.payoutAccount || undefined });
      }}
    >
      <Input label="Shop name" value={f.name} onChange={set('name')} required />
      <Input label="Owner name" value={f.ownerName} onChange={set('ownerName')} required />
      <Input label="Shop mobile (WhatsApp)" inputMode="numeric" maxLength={10} value={f.mobile} onChange={set('mobile')} required />
      <Input label="Email" type="email" value={f.email} onChange={set('email')} />
      <div className="sm:col-span-2"><Input label="Address" value={f.address} onChange={set('address')} required /></div>
      <Input label="Area" value={f.area} onChange={set('area')} required />
      <Input label="City" value={f.city} onChange={set('city')} required />
      <Input label="Pincode" inputMode="numeric" maxLength={6} value={f.pincode} onChange={set('pincode')} required />
      <Input label="Google Maps link" type="url" value={f.mapsUrl} onChange={set('mapsUrl')} />
      <Input label="Opens at" type="time" value={f.openTime} onChange={set('openTime')} />
      <Input label="Closes at" type="time" value={f.closeTime} onChange={set('closeTime')} />
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Weekly holidays</legend>
        <div className="flex flex-wrap gap-3">
          {DAYS.map((d) => (
            <label key={d} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={f.holidays.includes(d)} onChange={() => toggle('holidays', d)} /> {d[0] + d.slice(1, 3).toLowerCase()}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Services offered</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ALL_SERVICES.map((s) => (
            <label key={s} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={f.services.includes(s)} onChange={() => toggle('services', s)} /> {SERVICE_LABEL[s]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.deliveryAvailable} onChange={(e) => setF((p) => ({ ...p, deliveryAvailable: e.target.checked }))} /> Offer local delivery
      </label>
      <Input label="Delivery radius (km)" type="number" min={0} max={50} value={f.deliveryRadiusKm} onChange={(e) => setF((p) => ({ ...p, deliveryRadiusKm: Number(e.target.value) }))} disabled={!f.deliveryAvailable} />
      <Input label="Typical ready time (minutes)" type="number" min={5} value={f.estimatedPickupMins} onChange={(e) => setF((p) => ({ ...p, estimatedPickupMins: Number(e.target.value) }))} />
      <div />
      <Input label="Payout UPI ID" value={f.payoutUpi ?? ''} onChange={set('payoutUpi')} hint={masked?.upi ? `Saved: ${masked.upi}. Only the last 4 characters are stored.` : 'Only a masked reference is stored.'} autoComplete="off" />
      <Input label="Bank account number" value={f.payoutAccount ?? ''} onChange={set('payoutAccount')} hint={masked?.account ? `Saved: ${masked.account}` : 'Only the last 4 digits are stored.'} autoComplete="off" />
      {error ? <div className="sm:col-span-2"><ErrorState error={error} /></div> : null}
      <div className="sm:col-span-2">
        <Button variant="primary" type="submit" size="lg" loading={busy}>{submitLabel}</Button>
      </div>
    </form>
  );
}
