import type {
  BindingType,
  DiscountType,
  FulfillmentType,
  LaminationType,
  PaperQuality,
  PaperSize,
  PrintColor,
  PrintSides,
} from '@prisma/client';
import { parsePageRange } from '../lib/pageRange';

/** The subset of PricingRule used for calculation (all money in paise). */
export interface PriceRule {
  bwSingle: number;
  bwDouble: number;
  colorSingle: number;
  colorDouble: number;
  a3Multiplier: number;
  legalMultiplier: number;
  bondExtra: number;
  glossyExtra: number;
  spiralBinding: number;
  softBinding: number;
  hardBinding: number;
  laminationSingle: number;
  laminationDouble: number;
  deliveryFee: number;
  freeDeliveryAbove: number | null;
  minOrderAmount: number;
  taxPercent: number;
}

export interface PrintSettings {
  color: PrintColor;
  paperSize: PaperSize;
  sides: PrintSides;
  paperQuality: PaperQuality;
  copies: number;
  pageRange?: string | null;
  binding: BindingType;
  lamination: LaminationType;
}

export interface QuoteItemInput {
  key: string; // usually fileId
  fileName: string;
  totalPages: number;
  settings: PrintSettings;
}

export interface CouponInput {
  code: string;
  discountType: DiscountType;
  value: number;
  maxDiscount: number | null;
  minOrder: number;
}

export interface ItemBreakdown {
  key: string;
  fileName: string;
  totalPages: number;
  printedPages: number;
  sheets: number;
  copies: number;
  ratePerPage: number;
  sizeMultiplier: number;
  printCost: number;
  paperExtra: number;
  bindingCost: number;
  laminationCost: number;
  lineTotal: number;
}

export interface Quote {
  items: ItemBreakdown[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  couponCode: string | null;
  tax: number;
  taxPercent: number;
  total: number;
  minOrderAmount: number;
  meetsMinimum: boolean;
}

export class PricingError extends Error {}

function itemBreakdown(rule: PriceRule, item: QuoteItemInput): ItemBreakdown {
  const s = item.settings;
  let pages: number[];
  try {
    pages = parsePageRange(s.pageRange, item.totalPages);
  } catch (e) {
    throw new PricingError(`${item.fileName}: ${(e as Error).message}`);
  }
  const printedPages = pages.length;
  const isDouble = s.sides === 'DOUBLE';
  const sheets = isDouble ? Math.ceil(printedPages / 2) : printedPages;

  const ratePerPage =
    s.color === 'COLOR' ? (isDouble ? rule.colorDouble : rule.colorSingle) : isDouble ? rule.bwDouble : rule.bwSingle;
  const sizeMultiplier = s.paperSize === 'A3' ? rule.a3Multiplier : s.paperSize === 'LEGAL' ? rule.legalMultiplier : 1;

  const printCost = Math.round(printedPages * s.copies * ratePerPage * sizeMultiplier);
  const perSheetExtra = s.paperQuality === 'BOND_80' ? rule.bondExtra : s.paperQuality === 'GLOSSY' ? rule.glossyExtra : 0;
  const paperExtra = sheets * s.copies * perSheetExtra;
  const bindingUnit =
    s.binding === 'SPIRAL' ? rule.spiralBinding : s.binding === 'SOFT' ? rule.softBinding : s.binding === 'HARD' ? rule.hardBinding : 0;
  const bindingCost = bindingUnit * s.copies;
  const lamUnit = s.lamination === 'SINGLE' ? rule.laminationSingle : s.lamination === 'DOUBLE' ? rule.laminationDouble : 0;
  const laminationCost = lamUnit * sheets * s.copies;

  return {
    key: item.key,
    fileName: item.fileName,
    totalPages: item.totalPages,
    printedPages,
    sheets,
    copies: s.copies,
    ratePerPage,
    sizeMultiplier,
    printCost,
    paperExtra,
    bindingCost,
    laminationCost,
    lineTotal: printCost + paperExtra + bindingCost + laminationCost,
  };
}

export function couponDiscount(coupon: CouponInput | null, subtotal: number): number {
  if (!coupon || subtotal < coupon.minOrder) return 0;
  let d = coupon.discountType === 'PERCENT' ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
  if (coupon.maxDiscount != null) d = Math.min(d, coupon.maxDiscount);
  return Math.min(d, subtotal);
}

/**
 * subtotal = Σ(pages × copies × per-page rate × size multiplier + add-ons)
 * total    = subtotal + delivery fee + tax − discount
 */
export function calculateQuote(
  rule: PriceRule,
  items: QuoteItemInput[],
  fulfillment: FulfillmentType,
  coupon: CouponInput | null = null,
): Quote {
  if (items.length === 0) throw new PricingError('Add at least one file');
  const breakdown = items.map((i) => itemBreakdown(rule, i));
  const subtotal = breakdown.reduce((sum, i) => sum + i.lineTotal, 0);

  let deliveryFee = 0;
  if (fulfillment === 'DELIVERY') {
    deliveryFee = rule.freeDeliveryAbove != null && subtotal >= rule.freeDeliveryAbove ? 0 : rule.deliveryFee;
  }
  const discount = couponDiscount(coupon, subtotal);
  const tax = Math.round(((subtotal - discount) * rule.taxPercent) / 100);
  const total = subtotal + deliveryFee + tax - discount;

  return {
    items: breakdown,
    subtotal,
    deliveryFee,
    discount,
    couponCode: discount > 0 && coupon ? coupon.code : null,
    tax,
    taxPercent: rule.taxPercent,
    total,
    minOrderAmount: rule.minOrderAmount,
    meetsMinimum: subtotal >= rule.minOrderAmount,
  };
}

export function ruleSnapshot<T extends PriceRule>(r: T): PriceRule {
  return {
    bwSingle: r.bwSingle,
    bwDouble: r.bwDouble,
    colorSingle: r.colorSingle,
    colorDouble: r.colorDouble,
    a3Multiplier: r.a3Multiplier,
    legalMultiplier: r.legalMultiplier,
    bondExtra: r.bondExtra,
    glossyExtra: r.glossyExtra,
    spiralBinding: r.spiralBinding,
    softBinding: r.softBinding,
    hardBinding: r.hardBinding,
    laminationSingle: r.laminationSingle,
    laminationDouble: r.laminationDouble,
    deliveryFee: r.deliveryFee,
    freeDeliveryAbove: r.freeDeliveryAbove,
    minOrderAmount: r.minOrderAmount,
    taxPercent: r.taxPercent,
  };
}
