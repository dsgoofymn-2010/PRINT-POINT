import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './api';
import { toQuotePayload, type Cart } from './cart';
import type { Quote } from './types';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Live server-side quote; the server is the source of truth for prices. */
export function useQuote(cart: Cart | null) {
  const payload = cart && cart.items.length ? JSON.stringify(toQuotePayload(cart)) : null;
  const debounced = useDebounced(payload, 400);
  return useQuery({
    queryKey: ['quote', debounced],
    queryFn: () => api.post<{ quote: Quote }>('/orders/quote', JSON.parse(debounced!)).then((r) => r.quote),
    enabled: !!debounced,
    placeholderData: keepPreviousData,
    retry: false,
  });
}
