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
