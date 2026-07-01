import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';

export interface AppNotification {
  id: string;
  type: 'upload' | 'security' | 'billing' | 'system';
  title: string;
  message: string;
  status: 'unread' | 'read';
  createdAt: string;
  readAt?: string;
}

export interface NotificationsPage {
  data: AppNotification[];
  total: number;
  unreadCount: number;
}

export function useNotifications(page = 1, unreadOnly = false) {
  return useQuery<NotificationsPage>({
    queryKey: ['notifications', page, unreadOnly],
    queryFn: () =>
      api
        .get(`/notifications?page=${page}&unreadOnly=${unreadOnly}`)
        .then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
