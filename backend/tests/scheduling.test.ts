import { describe, expect, it, vi } from 'vitest';
<<<<<<< HEAD

vi.mock('../src/lib/prisma', () => ({ prisma: {} }));

const { nextRegularOpening } = await import('../src/lib/shopHours');
const { manuallyOpen, nextOpening, shopIsTakingRequests } = await import('../src/services/requests');

=======
import { nextRegularOpening } from '../src/lib/shopHours';
import { manuallyOpen, nextOpening, shopIsTakingRequests } from '../src/services/requests';

// vitest hoists this above the imports, so services/requests gets the fake prisma.
vi.mock('../src/lib/prisma', () => ({ prisma: {} }));

>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7
// India time (UTC+5:30) as a Date.
const ist = (s: string) => new Date(`${s}+05:30`);

const shop = {
  status: 'APPROVED' as const,
  openTime: '09:00',
  closeTime: '21:00',
  holidays: ['SUNDAY'],
  acceptingRequests: true,
  reopensAt: null as Date | null,
};

describe('nextRegularOpening', () => {
  it('is later today when before opening time', () => {
    expect(nextRegularOpening(shop, ist('2026-10-24T07:00'))).toEqual(ist('2026-10-24T09:00'));
  });

  it('skips the weekly holiday', () => {
    // Saturday night -> Sunday is a holiday -> Monday 9 am
    expect(nextRegularOpening(shop, ist('2026-10-24T22:00'))).toEqual(ist('2026-10-26T09:00'));
  });
});

describe('nextOpening', () => {
  it('is null while the shop is open', () => {
    expect(nextOpening(shop, ist('2026-10-24T10:00'))).toBeNull();
  });

  it('is the next opening hours after closing time', () => {
    expect(nextOpening(shop, ist('2026-10-23T22:00'))).toEqual(ist('2026-10-24T09:00'));
  });

  it('uses the reopening time the owner set', () => {
    const closed = { ...shop, acceptingRequests: false, reopensAt: ist('2026-10-24T14:30') };
    expect(nextOpening(closed, ist('2026-10-24T12:00'))).toEqual(ist('2026-10-24T14:30'));
  });

  it('moves a reopening time outside hours to the next opening', () => {
    const closed = { ...shop, acceptingRequests: false, reopensAt: ist('2026-10-23T23:00') };
    expect(nextOpening(closed, ist('2026-10-23T12:00'))).toEqual(ist('2026-10-24T09:00'));
  });

  it('is null when closed with no reopening time', () => {
    expect(nextOpening({ ...shop, acceptingRequests: false }, ist('2026-10-24T12:00'))).toBeNull();
  });
});

describe('reopening on its own', () => {
  it('opens again once the reopening time passes', () => {
    const closed = { ...shop, acceptingRequests: false, reopensAt: ist('2026-10-24T14:30') };
    expect(manuallyOpen(closed, ist('2026-10-24T14:00'))).toBe(false);
    expect(shopIsTakingRequests(closed, ist('2026-10-24T14:31'))).toBe(true);
  });
});
