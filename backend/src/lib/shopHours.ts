const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/** Current time in India (IST, UTC+5:30) regardless of server timezone. */
function nowIST(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return { day: DAYS[ist.getUTCDay()], minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

export function isShopOpen(shop: { openTime: string; closeTime: string; holidays: string[] }, now = new Date()): boolean {
  const { day, minutes } = nowIST(now);
  if (shop.holidays.includes(day)) return false;
  const open = toMinutes(shop.openTime);
  const close = toMinutes(shop.closeTime);
  return close > open ? minutes >= open && minutes < close : minutes >= open || minutes < close;
}

/** Today's hours in IST, or null when today is a weekly holiday. */
export function todaysHours(shop: { openTime: string; closeTime: string; holidays: string[] }, now = new Date()): { open: string; close: string } | null {
  const { day } = nowIST(now);
  return shop.holidays.includes(day) ? null : { open: shop.openTime, close: shop.closeTime };
}

/** The next time regular hours start, at or after `from` (skips weekly holidays). */
export function nextRegularOpening(shop: { openTime: string; holidays: string[] }, from = new Date()): Date | null {
  const open = toMinutes(shop.openTime);
  const ist = new Date(from.getTime() + 330 * 60_000);
  const dayStart = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  for (let d = 0; d <= 7; d++) {
    const istOpen = dayStart + d * 86_400_000 + open * 60_000;
    const at = new Date(istOpen - 330 * 60_000);
    if (at >= from && !shop.holidays.includes(DAYS[new Date(istOpen).getUTCDay()])) return at;
  }
  return null;
}

/** "Sat, 26 Oct, 9:00 am" in India time, for messages. */
export const formatIST = (d: Date) =>
  d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
