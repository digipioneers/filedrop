import React, { useState } from 'react';
import {
  Page, Card, ResourceList, ResourceItem, Text,
  Badge, EmptyState, Pagination, Modal,
  InlineStack, BlockStack, Box, Spinner, Button, Divider,
} from '@shopify/polaris';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../utils/api';

const formatBytes = (b: number) => {
  if (!b) return '0 B';
  const k = 1024, s = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
};

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const [orderId, setOrderId] = useState<string|null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['orders', page],
    queryFn: () => api.get('/orders', { params: { page, limit: 20 } }).then(r => r.data),
    placeholderData: (prev: any) => prev,
  } as any);

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['order-detail', orderId],
    queryFn: () => api.get(`/orders/${orderId}/uploads`).then(r => r.data),
    enabled: !!orderId,
  } as any);

  const { mutateAsync: downloadAll, isPending: downloading } = useMutation({
    mutationFn: (id: string) => api.get(`/orders/${id}/download-all`).then(r => r.data),
    onSuccess: (files: any[]) => {
      files.forEach((f, i) => setTimeout(() => { const a = document.createElement('a'); a.href = f.url; a.download = f.fileName; a.click(); }, i * 500));
    },
  });

  const orders = (data as any)?.orders ?? [];
  const total = (data as any)?.total ?? 0;
  const pages = Math.ceil(total / 20);

  return (
    <Page title="Orders with Uploads" subtitle={`${total} orders`}>
      <Card>
        <ResourceList
          resourceName={{ singular: 'order', plural: 'orders' }}
          items={orders}
          loading={isLoading}
          renderItem={(order: any) => (
            <ResourceItem id={order.orderId} onClick={() => setOrderId(order.orderId)}
              shortcutActions={[{ content: 'Download All', onAction: () => downloadAll(order.orderId) }]}>
              <InlineStack gap="400" align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="bodyMd" fontWeight="semibold" as="span">
                    Order #{order.shopifyOrderId || order.orderId?.slice(0,8)}
                  </Text>
                  <InlineStack gap="200">
                    <Badge>{`${order.fileCount} files`}</Badge>
                    <Text variant="bodySm" tone="subdued" as="span">{formatBytes(parseInt(order.totalSizeBytes||'0'))}</Text>
                  </InlineStack>
                </BlockStack>
              </InlineStack>
            </ResourceItem>
          )}
          emptyState={<EmptyState heading="No orders with uploads" image=""><p>Orders with customer uploads appear here.</p></EmptyState>}
        />
        {pages > 1 && (
          <Box padding="400">
            <InlineStack align="center">
              <Pagination hasPrevious={page>1} hasNext={page<pages}
                onPrevious={() => setPage(p=>p-1)} onNext={() => setPage(p=>p+1)}
                label={`Page ${page} of ${pages}`} />
            </InlineStack>
          </Box>
        )}
      </Card>

      <Modal open={!!orderId} onClose={() => setOrderId(null)}
        title={`Order #${(detail as any)?.shopifyOrderId || orderId?.slice(0,8)}`}
        primaryAction={{ content: 'Download All', loading: downloading, onAction: () => orderId && downloadAll(orderId) }}
        secondaryActions={[{ content: 'Close', onAction: () => setOrderId(null) }]}
        large>
        <Modal.Section>
          {loadingDetail ? <InlineStack align="center"><Spinner /></InlineStack> :
            detail ? (
              <BlockStack gap="300">
                <InlineStack gap="600">
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued" as="span">Files</Text>
                    <Text variant="headingMd" as="span">{(detail as any).totalFiles}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued" as="span">Total Size</Text>
                    <Text variant="headingMd" as="span">{formatBytes((detail as any).totalSizeBytes)}</Text>
                  </BlockStack>
                </InlineStack>
                <Divider />
                {(detail as any).uploads?.map((u: any) => (
                  <InlineStack key={u.id} gap="400" align="space-between" blockAlign="center">
                    <BlockStack gap="025">
                      <Text variant="bodyMd" as="span">{u.originalFileName}</Text>
                      <Text variant="bodySm" tone="subdued" as="span">{formatBytes(u.fileSizeBytes)}</Text>
                    </BlockStack>
                    {u.signedUrl && <Button size="slim" onClick={() => window.open(u.signedUrl, '_blank')}>Download</Button>}
                  </InlineStack>
                ))}
              </BlockStack>
            ) : <Text as="p" tone="subdued">No files found.</Text>
          }
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export { OrdersPage };
