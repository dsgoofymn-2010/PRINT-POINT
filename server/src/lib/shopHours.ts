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
