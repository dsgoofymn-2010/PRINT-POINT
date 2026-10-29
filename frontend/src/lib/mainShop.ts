import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { ShopSummary } from './types';

/** This app serves one shop; every customer request goes to it. */
export function useMainShop() {
  return useQuery({
    queryKey: ['main-shop'],
    queryFn: () => api.get<{ shop: ShopSummary }>('/shops/main').then((r) => r.shop),
    staleTime: 60_000,
  });
}
