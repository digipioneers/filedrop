import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';

export interface Plan {
  id: string;
  name: 'free' | 'starter' | 'pro';
  displayName: string;
  monthlyPrice: number;
  uploadsPerMonth: number;
  storageBytes: number;
  maxFileSizeBytes: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
}

export interface Subscription {
  id: string;
  merchantId: string;
  planId: string;
  status: 'active' | 'pending' | 'cancelled' | 'expired' | 'trial';
  trialStartsAt?: string;
  trialEndsAt?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

export function usePlans() {
  return useQuery<Plan[]>({
    queryKey: ['plans'],
    queryFn: () => api.get('/billing/plans').then((r) => r.data.data ?? []),
    staleTime: 3_600_000,
  });
}

export function useCurrentPlan() {
  return useQuery<{ subscription: Subscription | null; plan: Plan }>({
    queryKey: ['billing', 'current'],
    queryFn: () => api.get('/billing/current').then((r) => r.data.data),
    staleTime: 60_000,
  });
}

export function useSubscribe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planName, returnUrl }: { planName: string; returnUrl: string }) =>
      api
        .post('/billing/subscribe', { planName, returnUrl })
        .then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing'] }),
  });
}

export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/billing/cancel').then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing'] }),
  });
}
