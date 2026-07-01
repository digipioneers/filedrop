import React, { useState } from 'react';
import {
  Page, Layout, Card, ResourceList, ResourceItem, Text,
  Badge, Button, ButtonGroup, EmptyState, Filters,
  Pagination, Modal, Banner, Spinner,
} from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';

const FIELD_TYPE_LABELS: Record<string, string> = {
  image: 'Image Upload',
  pdf: 'PDF Upload',
  video: 'Video Upload',
  zip: 'ZIP Upload',
  document: 'Document Upload',
  custom: 'Custom Upload',
};

const ASSIGNMENT_TYPE_LABELS: Record<string, string> = {
  store: 'Entire Store',
  product: 'Specific Products',
  variant: 'Product Variants',
  collection: 'Collections',
  tag: 'Product Tags',
};

export function UploadFieldsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteModalField, setDeleteModalField] = useState<any>(null);
  const [searchValue, setSearchValue] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['upload-fields'],
    queryFn: () => api.get('/uploads/fields').then((r) => r.data.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/uploads/fields/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upload-fields'] });
      setDeleteModalField(null);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/uploads/fields/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['upload-fields'] }),
  });

  const fields = (data ?? []).filter((f: any) =>
    !searchValue || f.label.toLowerCase().includes(searchValue.toLowerCase()),
  );

  if (isLoading) {
    return (
      <Page title="Upload Fields">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner />
        </div>
      </Page>
    );
  }

  return (
    <Page
      title="Upload Fields"
      primaryAction={{
        content: 'Create Upload Field',
        onAction: () => navigate('/app/fields/new'),
      }}
    >
      <Layout>
        <Layout.Section>
          {data?.length === 0 ? (
            <Card>
              <EmptyState
                heading="Create your first upload field"
                action={{
                  content: 'Create Upload Field',
                  onAction: () => navigate('/app/fields/new'),
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Upload fields let your customers attach files to their orders.</p>
              </EmptyState>
            </Card>
          ) : (
            <Card>
              <div style={{ padding: '16px' }}>
                <Filters
                  queryValue={searchValue}
                  filters={[]}
                  onQueryChange={setSearchValue}
                  onQueryClear={() => setSearchValue('')}
                  onClearAll={() => setSearchValue('')}
                  queryPlaceholder="Search fields..."
                />
              </div>
              <ResourceList
                resourceName={{ singular: 'upload field', plural: 'upload fields' }}
                items={fields}
                renderItem={(field: any) => (
                  <ResourceItem
                    id={field.id}
                    onClick={() => navigate(`/app/fields/${field.id}/edit`)}
                    shortcutActions={[
                      {
                        content: field.isActive ? 'Deactivate' : 'Activate',
                        onAction: () =>
                          toggleActiveMutation.mutate({
                            id: field.id,
                            isActive: !field.isActive,
                          }),
                      },
                      {
                        content: 'Delete',
                        destructive: true,
                        onAction: () => setDeleteModalField(field),
                      },
                    ]}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <Text variant="bodyMd" fontWeight="bold" as="p">
                          {field.label}
                        </Text>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                          <Badge>{FIELD_TYPE_LABELS[field.fieldType] ?? field.fieldType}</Badge>
                          <Badge tone="info">
                            {ASSIGNMENT_TYPE_LABELS[field.assignmentType] ?? field.assignmentType}
                          </Badge>
                          {field.required && <Badge tone="attention">Required</Badge>}
                          <Badge tone={field.isActive ? 'success' : 'critical'}>
                            {field.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        {field.description && (
                          <Text variant="bodySm" tone="subdued" as="p" truncate>
                            {field.description}
                          </Text>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <Text variant="bodySm" tone="subdued" as="p">
                          Max {field.maxFileSizeMb}MB
                        </Text>
                        <Text variant="bodySm" tone="subdued" as="p">
                          Up to {field.maxFiles} file{field.maxFiles > 1 ? 's' : ''}
                        </Text>
                      </div>
                    </div>
                  </ResourceItem>
                )}
              />
            </Card>
          )}
        </Layout.Section>
      </Layout>

      {/* Delete confirmation modal */}
      <Modal
        open={!!deleteModalField}
        onClose={() => setDeleteModalField(null)}
        title="Delete upload field?"
        primaryAction={{
          content: 'Delete',
          destructive: true,
          loading: deleteMutation.isPending,
          onAction: () => deleteMutation.mutate(deleteModalField?.id),
        }}
        secondaryActions={[
          { content: 'Cancel', onAction: () => setDeleteModalField(null) },
        ]}
      >
        <Modal.Section>
          <Banner tone="warning">
            This will permanently delete the <strong>{deleteModalField?.label}</strong> field.
            Existing uploads will not be deleted.
          </Banner>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
