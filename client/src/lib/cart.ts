import { useCallback, useEffect, useState } from 'react';
import type { DeliveryInfo, Fulfillment, PrintSettings } from './types';

export interface CartItem {
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  pagesOverride?: number;
  settings: PrintSettings;
}

export interface Cart {
  shopId: string;
  shopName: string;
  draftId?: string;
  items: CartItem[];
  fulfillment: Fulfillment;
  couponCode: string;
  specialInstructions: string;
  delivery: DeliveryInfo | null;
}

export const DEFAULT_SETTINGS: PrintSettings = {
  color: 'BW',
  paperSize: 'A4',
  sides: 'SINGLE',
  paperQuality: 'NORMAL_70',
  copies: 1,
  pageRange: '',
  orientation: 'PORTRAIT',
  fitMode: 'FIT',
  binding: 'NONE',
  lamination: 'NONE',
};

const KEY = 'pp_cart';
const listeners = new Set<(c: Cart | null) => void>();

function read(): Cart | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Cart) : null;
  } catch {
    return null;
  }
}

export function saveCart(c: Cart | null) {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: cart lives in memory only */
  }
  listeners.forEach((l) => l(c));
}

/** Cart persisted in localStorage so a refresh on a slow phone does not lose work. */
export function useCart() {
  const [cart, setCart] = useState<Cart | null>(read);
  useEffect(() => {
    listeners.add(setCart);
    return () => {
      listeners.delete(setCart);
    };
  }, []);
  const update = useCallback((fn: (c: Cart | null) => Cart | null) => saveCart(fn(read())), []);
  return { cart, update, clear: () => saveCart(null) };
}

export function toOrderPayload(c: Cart, saveAsDraft: boolean) {
  return {
    shopId: c.shopId,
    fulfillment: c.fulfillment,
    couponCode: c.couponCode || null,
    specialInstructions: c.specialInstructions || null,
    delivery: c.fulfillment === 'DELIVERY' ? c.delivery : null,
    saveAsDraft,
    items: c.items.map((i) => ({
      fileId: i.fileId,
      pagesOverride: i.pagesOverride,
      settings: { ...i.settings, pageRange: i.settings.pageRange || null },
    })),
  };
}

export const toQuotePayload = (c: Cart) => {
  const { shopId, fulfillment, couponCode, items } = toOrderPayload(c, true);
  return { shopId, fulfillment, couponCode, items };
};
