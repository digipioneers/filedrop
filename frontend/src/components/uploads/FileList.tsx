import React from 'react';
import {
  DataTable, Badge, Button, Text, EmptyState, Spinner,
  InlineStack, Box,
} from '@shopify/polaris';
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
  createdAt: string;
}

interface FileListProps {
  uploads: Upload[];
  loading?: boolean;
  onDownload?: (id: string) => void;
  onDelete?: (id: string) => void;
  showOrder?: boolean;
  emptyMessage?: string;
}

export function FileList({
  uploads,
  loading = false,
  onDownload,
  onDelete,
  showOrder = true,
  emptyMessage = 'No files uploaded yet.',
}: FileListProps) {
  if (loading) {
    return (
      <Box padding="800">
        <InlineStack align="center">
          <Spinner size="large" />
        </InlineStack>
      </Box>
    );
  }

  if (!uploads.length) {
    return (
      <EmptyState
        heading="No uploads yet"
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      >
        <Text as="p">{emptyMessage}</Text>
      </EmptyState>
    );
  }

  const columnContentTypes: Array<'text' | 'numeric'> = [
    'text', 'text', 'numeric', 'text', 'text', 'text',
  ];

  const headings = [
    'File Name',
    'Type',
    'Size',
    ...(showOrder ? ['Order'] : []),
    'Status',
    'Uploaded',
    'Actions',
  ];

  const rows = uploads.map((u) => [
    <Text variant="bodySm" fontWeight="semibold" truncate>{u.originalFileName}</Text>,
    <Text variant="bodySm" tone="subdued">{u.mimeType.split('/')[1]?.toUpperCase() ?? u.mimeType}</Text>,
    formatBytes(u.fileSizeBytes),
    ...(showOrder ? [u.orderId ? `#${u.orderId}` : '—'] : []),
    <FileStatusBadge status={u.status} />,
    formatDateTime(u.createdAt),
    <InlineStack gap="200">
      {onDownload && u.status === 'clean' && (
        <Button variant="plain" onClick={() => onDownload(u.id)}>
          Download
        </Button>
      )}
      {onDelete && (
        <Button variant="plain" tone="critical" onClick={() => onDelete(u.id)}>
          Delete
        </Button>
      )}
    </InlineStack>,
  ]);

  return (
    <DataTable
      columnContentTypes={columnContentTypes}
      headings={headings}
      rows={rows}
    />
  );
}
