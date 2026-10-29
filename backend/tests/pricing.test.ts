import { describe, expect, it } from 'vitest';
import { parsePageRange } from '../src/lib/pageRange';
import { calculateQuote, couponDiscount, type PriceRule, type PrintSettings } from '../src/services/pricing';

const rule: PriceRule = {
  bwSingle: 150, bwDouble: 100, colorSingle: 1000, colorDouble: 800, a3Multiplier: 2, legalMultiplier: 1.2,
  bondExtra: 50, glossyExtra: 500, spiralBinding: 3000, softBinding: 6000, hardBinding: 15000,
  laminationSingle: 1500, laminationDouble: 2500, deliveryFee: 3000, freeDeliveryAbove: 50000, minOrderAmount: 1000, taxPercent: 0,
};
const base: PrintSettings = { color: 'BW', paperSize: 'A4', sides: 'SINGLE', paperQuality: 'NORMAL_70', copies: 1, binding: 'NONE', lamination: 'NONE' };
const item = (settings: Partial<PrintSettings>, totalPages = 10) => ({ key: 'f', fileName: 'doc.pdf', totalPages, settings: { ...base, ...settings } });

describe('parsePageRange', () => {
  it('returns all pages for empty input', () => expect(parsePageRange('', 3)).toEqual([1, 2, 3]));
  it('parses mixed ranges with "end"', () => expect(parsePageRange('1-3, 5, 8-end', 9)).toEqual([1, 2, 3, 5, 8, 9]));
  it('de-duplicates overlaps', () => expect(parsePageRange('1-4,2-3', 5)).toHaveLength(4));
  it('rejects pages past the end', () => expect(() => parsePageRange('1-12', 10)).toThrow(/beyond/));
  it('rejects reversed ranges', () => expect(() => parsePageRange('5-2', 10)).toThrow(/reversed/));
  it('rejects junk', () => expect(() => parsePageRange('abc', 10)).toThrow(/Invalid/));
});

describe('calculateQuote', () => {
  it('prices simple B/W single-sided pages', () => {
    const q = calculateQuote(rule, [item({ copies: 2 })], 'PICKUP');
    expect(q.subtotal).toBe(10 * 2 * 150);
    expect(q.total).toBe(3000);
    expect(q.meetsMinimum).toBe(true);
  });

  it('applies A3 multiplier, double-sided sheets, bond paper, binding and lamination', () => {
    const q = calculateQuote(
      rule,
      [item({ color: 'COLOR', paperSize: 'A3', sides: 'DOUBLE', paperQuality: 'BOND_80', copies: 3, binding: 'SPIRAL', lamination: 'SINGLE' }, 9)],
      'PICKUP',
    );
    const i = q.items[0];
    expect(i.sheets).toBe(5);
    expect(i.printCost).toBe(9 * 3 * 800 * 2);
    expect(i.paperExtra).toBe(5 * 3 * 50);
    expect(i.bindingCost).toBe(3 * 3000);
    expect(i.laminationCost).toBe(5 * 3 * 1500);
    expect(q.subtotal).toBe(i.lineTotal);
  });

  it('respects page range', () => {
    const q = calculateQuote(rule, [item({ pageRange: '1-3, 7' })], 'PICKUP');
    expect(q.items[0].printedPages).toBe(4);
  });

  it('adds delivery fee below the free threshold and waives it above', () => {
    expect(calculateQuote(rule, [item({})], 'DELIVERY').deliveryFee).toBe(3000);
    expect(calculateQuote(rule, [item({ color: 'COLOR', copies: 10 })], 'DELIVERY').deliveryFee).toBe(0);
  });

  it('applies tax after discount and flags minimum order', () => {
    const q = calculateQuote({ ...rule, taxPercent: 18 }, [item({}, 2)], 'PICKUP');
    expect(q.meetsMinimum).toBe(false);
    expect(q.tax).toBe(Math.round(300 * 0.18));
  });

  it('caps percentage coupons at maxDiscount', () => {
    const c = { code: 'X', discountType: 'PERCENT' as const, value: 50, maxDiscount: 1000, minOrder: 0 };
    expect(couponDiscount(c, 10000)).toBe(1000);
    expect(couponDiscount({ ...c, minOrder: 20000 }, 10000)).toBe(0);
  });
});
