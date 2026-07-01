import { useQuery } from '@tanstack/react-query';
import { api } from '../utils/api';

export interface TenantUsage {
  merchantId: string;
  shopDomain: string;
  planName: 'free' | 'starter' | 'pro';
  uploadsThisMonth: number;
  uploadsLimit: number;
  storageUsedBytes: number;
  storageLimit: number;
  maxFileSizeBytes: number;
  isWithinLimits: boolean;
  usagePercent: { uploads: number; storage: number };
}

export interface TrialStatus {
  isOnTrial: boolean;
  daysRemaining: number;
  trialEndsAt: string | null;
}

export function useTenantUsage() {
  return useQuery<TenantUsage>({
    queryKey: ['saas', 'usage'],
    queryFn: () => api.get('/saas/usage').then((r) => r.data.data),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useTrialStatus() {
  return useQuery<TrialStatus>({
    queryKey: ['saas', 'trial'],
    queryFn: () => api.get('/saas/trial').then((r) => r.data.data),
    staleTime: 300_000,
  });
}

/** Returns true if the merchant has hit 80%+ of any limit */
export function useNearLimit(): boolean {
  const { data } = useTenantUsage();
  if (!data) return false;
  return (
    data.usagePercent.uploads >= 80 ||
    data.usagePercent.storage >= 80
  );
}
