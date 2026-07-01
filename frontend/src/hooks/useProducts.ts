import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../utils/api';

export interface ShopifyProduct {
  id: string;
  shopifyProductId: string;
  title: string;
  handle: string;
  imageUrl?: string;
  variants: { id: string; title: string; sku: string }[];
  collections: { id: string; title: string }[];
  tags: string[];
}

export interface ShopifyCollection {
  id: string;
  title: string;
}

export function useProductSearch(query: string, enabled = true) {
  return useQuery<ShopifyProduct[]>({
    queryKey: ['products', 'search', query],
    queryFn: () =>
      api.get(`/products/search?q=${encodeURIComponent(query)}`).then((r) => r.data),
    enabled: enabled && query.length > 0,
    staleTime: 60_000,
  });
}

export function useCollections() {
  return useQuery<ShopifyCollection[]>({
    queryKey: ['products', 'collections'],
    queryFn: () => api.get('/products/collections').then((r) => r.data),
    staleTime: 300_000,
  });
}

export function useSyncProducts() {
  return useMutation({
    mutationFn: () => api.post('/products/sync').then((r) => r.data),
  });
}
