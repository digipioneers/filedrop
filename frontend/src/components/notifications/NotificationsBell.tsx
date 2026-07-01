import React, { useState, useRef, useEffect } from 'react';
import { Badge, Text, BlockStack, Box, InlineStack, Button, Spinner } from '@shopify/polaris';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '../../hooks/useNotifications';

const TYPE_ICONS: Record<string, string> = {
  upload: '⬆️',
  security: '🛡️',
  billing: '💳',
  system: '⚙️',
};

const TYPE_COLORS: Record<string, string> = {
  upload: '#008060',
  security: '#de3618',
  billing: '#5c6ac4',
  system: '#637381',
};

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useNotifications(1, false);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const unread = data?.unreadCount ?? 0;
  const notifications = data?.data ?? [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px',
          position: 'relative',
          fontSize: 20,
          lineHeight: 1,
          borderRadius: 8,
          color: 'var(--color-text-secondary)',
        }}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute',
            top: 2,
            right: 2,
            background: '#de3618',
            color: '#fff',
            fontSize: 10,
            fontWeight: 600,
            borderRadius: '50%',
            width: 16,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          width: 340,
          maxHeight: 480,
          overflowY: 'auto',
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-secondary)',
          borderRadius: 12,
          boxShadow: '0 4px 24px rgba(0,0,0,.12)',
          zIndex: 1000,
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <Text variant="headingSm" as="h3">Notifications</Text>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: '#008060',
                  padding: 0,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          {isLoading ? (
            <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
              <Spinner size="small" />
            </div>
          ) : notifications.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
              <Text variant="bodySm" tone="subdued" as="p">No notifications yet</Text>
            </div>
          ) : (
            notifications.map((n: any) => (
              <div
                key={n.id}
                onClick={() => n.status === 'unread' && markRead.mutate(n.id)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '0.5px solid var(--color-border-tertiary)',
                  cursor: n.status === 'unread' ? 'pointer' : 'default',
                  background: n.status === 'unread'
                    ? 'var(--color-background-secondary)'
                    : 'transparent',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                }}
              >
                <span style={{ fontSize: 18, flexShrink: 0 }}>{TYPE_ICONS[n.type] || '📢'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <Text variant="bodySm" fontWeight="semibold" as="p">{n.title}</Text>
                    <Text variant="bodySm" tone="subdued" as="p" truncate>
                      {timeAgo(n.createdAt)}
                    </Text>
                  </div>
                  <Text variant="bodySm" tone="subdued" as="p">{n.message}</Text>
                </div>
                {n.status === 'unread' && (
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: '#008060', flexShrink: 0, marginTop: 4,
                  }} />
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
