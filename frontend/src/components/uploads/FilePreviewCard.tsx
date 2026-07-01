import React from 'react';
import { Card, Text, InlineStack, BlockStack, Button, Thumbnail, Box } from '@shopify/polaris';
import { NoteIcon } from '@shopify/polaris-icons';
import { FileStatusBadge } from './FileStatusBadge';
import { formatBytes, formatDateTime } from '../../utils/format';

interface Upload {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  status: 'pending' | 'scanning' | 'clean' | 'infected' | 'failed';
  orderId?: string;
  customerEmail?: string;
  imageWidth?: number;
  imageHeight?: number;
  createdAt: string;
}

interface FilePreviewCardProps {
  upload: Upload;
  signedUrl?: string | null;
  onDelete?: (id: string) => void;
  showOrder?: boolean;
}

export function FilePreviewCard({ upload, signedUrl, onDelete, showOrder = true }: FilePreviewCardProps) {
  const isImage = upload.mimeType.startsWith('image/');

  const thumbnail = isImage && signedUrl ? (
    <Thumbnail source={signedUrl} size="large" alt={upload.originalFileName} />
  ) : (
    <div style={{
      width: 64,
      height: 64,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f4f6f8',
      borderRadius: 8,
      flexShrink: 0,
    }}>
      <NoteIcon width={28} height={28} />
    </div>
  );

  return (
    <Card>
      <Box padding="400">
        <InlineStack align="space-between" blockAlignment="start" gap="400">
          <InlineStack gap="400" blockAlignment="start">
            {thumbnail}
            <BlockStack gap="100">
              <Text variant="bodyMd" fontWeight="semibold" truncate>
                {upload.originalFileName}
              </Text>
              <Text variant="bodySm" tone="subdued">
                {formatBytes(upload.fileSizeBytes)}
                {upload.imageWidth && upload.imageHeight
                  ? ` · ${upload.imageWidth}×${upload.imageHeight}px`
                  : ''}
              </Text>
              <Text variant="bodySm" tone="subdued">
                {upload.mimeType}
              </Text>
              {showOrder && upload.orderId && (
                <Text variant="bodySm" tone="subdued">
                  Order #{upload.orderId}
                </Text>
              )}
              <Text variant="bodySm" tone="subdued">
                {formatDateTime(upload.createdAt)}
              </Text>
            </BlockStack>
          </InlineStack>

          <BlockStack gap="200" inlineAlign="end">
            <FileStatusBadge status={upload.status} />
            {upload.status === 'clean' && signedUrl && (
              <Button
                variant="plain"
                url={signedUrl}
                external
                accessibilityLabel={`Download ${upload.originalFileName}`}
              >
                Download
              </Button>
            )}
            {onDelete && (
              <Button
                variant="plain"
                tone="critical"
                onClick={() => onDelete(upload.id)}
                accessibilityLabel={`Delete ${upload.originalFileName}`}
              >
                Delete
              </Button>
            )}
          </BlockStack>
        </InlineStack>
      </Box>
    </Card>
  );
}
