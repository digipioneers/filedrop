import React, { useState, useEffect, useCallback } from 'react';
import {
  reactExtension,
  useApi,
  AdminBlock,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Image,
  Badge,
  Divider,
  Box,
  Icon,
  Link,
  ProgressIndicator,
} from '@shopify/ui-extensions-react/admin';

const TARGET = 'admin.order-details.block.render';

export default reactExtension(TARGET, () => <OrderUploadsBlock />);

interface UploadFile {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  status: 'pending' | 'scanning' | 'clean' | 'infected' | 'failed';
  signedUrl: string | null;
  createdAt: string;
  imageWidth?: number;
  imageHeight?: number;
}

interface OrderUploadsResponse {
  orderId: string;
  totalFiles: number;
  totalSizeBytes: number;
  uploads: UploadFile[];
}

function OrderUploadsBlock() {
  const { data, extension } = useApi(TARGET);
  const orderId = data?.selected?.[0]?.id;

  const [uploads, setUploads] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalSize, setTotalSize] = useState(0);

  const apiUrl = extension?.configuration?.api_url ?? '';

  const fetchUploads = useCallback(async () => {
    if (!orderId || !apiUrl) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Extract numeric order ID from GID (gid://shopify/Order/12345)
      const numericId = orderId.split('/').pop();

      const res = await fetch(`${apiUrl}/orders/${numericId}/uploads`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (res.status === 404) {
        setUploads([]);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json: { data: OrderUploadsResponse } = await res.json();
      setUploads(json.data.uploads ?? []);
      setTotalSize(json.data.totalSizeBytes ?? 0);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load uploads');
    } finally {
      setLoading(false);
    }
  }, [orderId, apiUrl]);

  useEffect(() => {
    fetchUploads();
  }, [fetchUploads]);

  const formatBytes = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1_048_576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1_048_576).toFixed(1)} MB`;
  };

  const getStatusTone = (status: string) => {
    switch (status) {
      case 'clean': return 'success';
      case 'infected': return 'critical';
      case 'scanning': return 'warning';
      default: return 'info';
    }
  };

  const isImage = (mimeType: string) => mimeType.startsWith('image/');

  if (loading) {
    return (
      <AdminBlock title="Customer Uploaded Files">
        <InlineStack inlineAlignment="center">
          <ProgressIndicator />
          <Text>Loading files...</Text>
        </InlineStack>
      </AdminBlock>
    );
  }

  if (error) {
    return (
      <AdminBlock title="Customer Uploaded Files">
        <Text tone="critical">Error: {error}</Text>
        <Button onPress={fetchUploads}>Retry</Button>
      </AdminBlock>
    );
  }

  if (!uploads.length) {
    return (
      <AdminBlock title="Customer Uploaded Files">
        <Text tone="subdued">No files were uploaded for this order.</Text>
      </AdminBlock>
    );
  }

  return (
    <AdminBlock title={`Customer Uploaded Files (${uploads.length})`}>
      <BlockStack gap="base">
        {/* Summary */}
        <InlineStack inlineAlignment="space-between">
          <Text>
            {uploads.length} file{uploads.length > 1 ? 's' : ''} · {formatBytes(totalSize)} total
          </Text>
          <Button
            variant="plain"
            onPress={() => {
              uploads
                .filter((u) => u.status === 'clean' && u.signedUrl)
                .forEach((u) => {
                  if (u.signedUrl) open(u.signedUrl, '_blank');
                });
            }}
          >
            Download all
          </Button>
        </InlineStack>

        <Divider />

        {/* File list */}
        {uploads.map((upload, i) => (
          <Box key={upload.id}>
            <BlockStack gap="tight">
              <InlineStack gap="base" blockAlignment="center">
                {/* Thumbnail */}
                {isImage(upload.mimeType) && upload.signedUrl ? (
                  <Image
                    source={upload.signedUrl}
                    alt={upload.originalFileName}
                    accessibilityDescription={upload.originalFileName}
                  />
                ) : (
                  <Box
                    padding="base"
                    background="subdued"
                    borderRadius="base"
                  >
                    <Icon name="NoteMinor" />
                  </Box>
                )}

                {/* Info */}
                <BlockStack gap="extraTight" inlineSize="fill">
                  <Text fontWeight="semibold" truncate>
                    {upload.originalFileName}
                  </Text>
                  <InlineStack gap="tight">
                    <Text size="small" tone="subdued">
                      {formatBytes(upload.fileSizeBytes)}
                    </Text>
                    <Text size="small" tone="subdued">·</Text>
                    <Text size="small" tone="subdued">
                      {new Date(upload.createdAt).toLocaleDateString()}
                    </Text>
                    {upload.imageWidth && upload.imageHeight && (
                      <>
                        <Text size="small" tone="subdued">·</Text>
                        <Text size="small" tone="subdued">
                          {upload.imageWidth}×{upload.imageHeight}px
                        </Text>
                      </>
                    )}
                  </InlineStack>
                  <InlineStack gap="tight" blockAlignment="center">
                    <Badge tone={getStatusTone(upload.status)}>
                      {upload.status}
                    </Badge>
                  </InlineStack>
                </BlockStack>

                {/* Actions */}
                {upload.status === 'clean' && upload.signedUrl && (
                  <Button
                    variant="plain"
                    onPress={() => open(upload.signedUrl!, '_blank')}
                  >
                    Download
                  </Button>
                )}
              </InlineStack>

              {i < uploads.length - 1 && <Divider />}
            </BlockStack>
          </Box>
        ))}
      </BlockStack>
    </AdminBlock>
  );
}
