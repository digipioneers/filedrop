import React, { useState, useMemo } from 'react';
import {
  Page, Card, ResourceList, ResourceItem, Text,
  Badge, Filters, Select, EmptyState, Pagination,
  Modal, InlineStack, BlockStack, Box, Thumbnail, Avatar, Banner,
} from '@shopify/polaris';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';

const formatBytes = (b: number) => {
  if (!b) return '0 B';
  const k = 1024, s = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
};

const STATUS_MAP: Record<string, any> = {
  pending:  { status: 'attention', label: 'Pending' },
  scanning: { status: 'info',      label: 'Scanning' },
  clean:    { status: 'success',   label: 'Clean' },
  infected: { status: 'critical',  label: 'Infected' },
  failed:   { status: 'warning',   label: 'Failed' },
};

// Stable reference — ResourceList internally memoizes an accessibility
// label based on this object, and a well-documented, long-standing Polaris
// bug (reported against many unrelated apps since 2020: "Error in
// translation for key 'Polaris.ResourceList.a11yCheckboxSelectAllMultiple'.
// No replacement found for key 'itemsLength'") is more likely to surface
// when resourceName is a fresh object literal on every render. Hoisting it
// out removes that as a variable entirely.
const RESOURCE_NAME = { singular: 'upload', plural: 'uploads' };

export default function UploadsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [deleteId, setDeleteId] = useState<string|null>(null);
  const [downloadError, setDownloadError] = useState<string|null>(null);
  const [downloadingId, setDownloadingId] = useState<string|null>(null);

  // Fetch a fresh signed URL for the file, then trigger a browser download.
  // The signed URL is served with Content-Disposition: attachment (set by the
  // backend via buildDownloadFilename), so navigating to it downloads the file
  // rather than opening it in place. We open it via a temporary anchor so this
  // works from inside Shopify's embedded admin iframe.
  const handleDownload = async (upload: any) => {
    setDownloadError(null);
    if (upload.status === 'infected') {
      setDownloadError(`"${upload.originalFileName}" was flagged as infected and can't be downloaded.`);
      return;
    }
    setDownloadingId(upload.id);
    try {
      const url = await api.get(`/uploads/${upload.id}/url`).then((r: any) => r.data.data);
      if (!url) throw new Error('No download URL was returned.');
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.download = upload.originalFileName || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e: any) {
      setDownloadError(
        e?.response?.data?.message || e?.message || 'Download failed. Please try again.',
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['uploads', page, search, status],
    queryFn: () => api.get('/uploads', { params: { page, limit: 25, search: search||undefined, status: status||undefined } }).then(r => r.data.data),
    placeholderData: (prev: any) => prev,
  } as any);

  const { mutateAsync: del, isPending: deleting } = useMutation({
    mutationFn: (id: string) => api.delete(`/uploads/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['uploads'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setDeleteId(null);
    },
  });

  // Memoized so `items` also has a stable reference across renders when the
  // underlying data hasn't actually changed (same reasoning as above).
  const uploads = useMemo(() => (data as any)?.data ?? [], [data]);
  const total = (data as any)?.total ?? 0;
  const pages = Math.ceil(total / 25);

  return (
    <Page title="All Uploads" subtitle={`${total} files`}>
      {downloadError && (
        <Box paddingBlockEnd="300">
          <Banner tone="critical" onDismiss={() => setDownloadError(null)}>
            <p>{downloadError}</p>
          </Banner>
        </Box>
      )}
      <Card>
        <ResourceList
          resourceName={RESOURCE_NAME}
          items={uploads}
          loading={isLoading}
          filterControl={
            <Filters
              queryValue={search}
              filters={[{
                key: 'status', label: 'Status',
                filter: <Select label="Status" labelHidden options={[
                  { label: 'All', value: '' },
                  { label: 'Clean', value: 'clean' },
                  { label: 'Pending', value: 'pending' },
                  { label: 'Infected', value: 'infected' },
                ]} value={status} onChange={v => { setStatus(v); setPage(1); }} />,
                shortcut: true,
              }]}
              appliedFilters={status ? [{ key: 'status', label: `Status: ${status}`, onRemove: () => setStatus('') }] : []}
              onQueryChange={v => { setSearch(v); setPage(1); }}
              onQueryClear={() => { setSearch(''); setPage(1); }}
              onClearAll={() => { setSearch(''); setStatus(''); setPage(1); }}
            />
          }
          renderItem={(upload: any) => {
            const badge = STATUS_MAP[upload.status] || STATUS_MAP.pending;
            return (
              <ResourceItem id={upload.id} onClick={() => handleDownload(upload)}
                shortcutActions={[
                  {
                    content: downloadingId === upload.id ? 'Downloading…' : 'Download',
                    onAction: () => handleDownload(upload),
                    disabled: upload.status === 'infected' || downloadingId === upload.id,
                  },
                  { content: 'Delete', onAction: () => setDeleteId(upload.id) },
                ]}
              >
                <InlineStack gap="400" align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="bodyMd" fontWeight="semibold" as="span">{upload.originalFileName}</Text>
                    <Text variant="bodySm" tone="subdued" as="span">
                      {formatBytes(upload.fileSizeBytes)} · {upload.customerEmail || 'No email'} · {new Date(upload.createdAt).toLocaleDateString()}
                    </Text>
                  </BlockStack>
                  <Badge tone={badge.status}>{badge.label}</Badge>
                </InlineStack>
              </ResourceItem>
            );
          }}
          emptyState={
            <EmptyState heading="No uploads yet" image="">
              <p>Customer uploads will appear here.</p>
            </EmptyState>
          }
        />
        {pages > 1 && (
          <Box padding="400">
            <InlineStack align="center">
              <Pagination hasPrevious={page > 1} hasNext={page < pages}
                onPrevious={() => setPage(p => p-1)} onNext={() => setPage(p => p+1)}
                label={`Page ${page} of ${pages}`} />
            </InlineStack>
          </Box>
        )}
      </Card>
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete upload?"
        primaryAction={{ content: 'Delete', destructive: true, loading: deleting, onAction: () => deleteId && del(deleteId) }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setDeleteId(null) }]}>
        <Modal.Section><Text as="p">This permanently deletes the file. Cannot be undone.</Text></Modal.Section>
      </Modal>
    </Page>
  );
}

export { UploadsPage };
