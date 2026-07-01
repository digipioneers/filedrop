import { useQuery } from '@tanstack/react-query';
import { api } from '../utils/api';

export interface DashboardStats {
  totalUploads: number;
  uploadsToday: number;
  uploadsThisMonth: number;
  ordersWithUploads: number;
  activeFields: number;
  storageUsedBytes: number;
  storageUsedFormatted: string;
}

export interface DailyUpload {
  date: string;
  count: number;
}

export interface MonthlyUpload {
  month: string;
  count: number;
}

export interface StorageGrowth {
  date: string;
  bytes: number;
}

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => api.get('/dashboard/stats').then((r) => r.data.data),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useDailyUploads(days = 30) {
  return useQuery<DailyUpload[]>({
    queryKey: ['analytics', 'daily', days],
    queryFn: () =>
      api.get(`/analytics/daily-uploads?days=${days}`).then((r) => r.data.data ?? []),
    staleTime: 300_000,
  });
}

export function useMonthlyUploads(months = 12) {
  return useQuery<MonthlyUpload[]>({
    queryKey: ['analytics', 'monthly', months],
    queryFn: () =>
      api.get(`/analytics/monthly-uploads?months=${months}`).then((r) => r.data.data ?? []),
    staleTime: 300_000,
  });
}

export function useStorageGrowth(days = 30) {
  return useQuery<StorageGrowth[]>({
    queryKey: ['analytics', 'storage', days],
    queryFn: () =>
      api.get(`/analytics/storage-growth?days=${days}`).then((r) => r.data.data ?? []),
    staleTime: 300_000,
  });
}

export function useRecentUploads() {
  return useQuery({
    queryKey: ['dashboard', 'recent'],
    queryFn: () => api.get('/dashboard/recent-uploads').then((r) => r.data.data ?? []),
    staleTime: 60_000,
  });
}
