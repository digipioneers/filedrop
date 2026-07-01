import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { useNotifications, useMarkAllNotificationsRead } from '../hooks/useNotifications';

const mockNotifications = {
  data: [
    {
      id: 'notif-1',
      type: 'upload',
      title: 'New file uploaded',
      message: 'photo.jpg uploaded for order #1001',
      status: 'unread',
      createdAt: '2024-01-15T10:00:00Z',
    },
  ],
  total: 1,
  unreadCount: 1,
};

const server = setupServer(
  http.get('*/notifications', () => HttpResponse.json(mockNotifications)),
  http.patch('*/notifications/read-all', () => new HttpResponse(null, { status: 204 })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const createWrapper = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

describe('useNotifications', () => {
  it('fetches and returns notifications', async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.data[0].title).toBe('New file uploaded');
    expect(result.current.data?.unreadCount).toBe(1);
  });

  it('returns loading state initially', () => {
    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);
  });

  it('handles API errors gracefully', async () => {
    server.use(
      http.get('*/notifications', () => HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })),
    );

    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
