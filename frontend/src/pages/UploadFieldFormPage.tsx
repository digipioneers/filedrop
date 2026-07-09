import React, { useEffect, useState } from 'react';
import {
  Page, Layout, Card, Form, FormLayout, TextField, Select,
  Checkbox, RangeSlider, Tag, Button, Spinner, Banner,
  Tabs, Text, InlineStack, BlockStack,
} from '@shopify/polaris';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';

const FIELD_TYPES = [
  { label: 'Image Upload', value: 'image' },
  { label: 'PDF Upload', value: 'pdf' },
  { label: 'Video Upload', value: 'video' },
  { label: 'ZIP Upload', value: 'zip' },
  { label: 'Document Upload', value: 'document' },
  { label: 'Custom File Upload', value: 'custom' },
];

const ASSIGNMENT_TYPES = [
  { label: 'Entire Store', value: 'store' },
  { label: 'Specific Products', value: 'product' },
  { label: 'Product Variants', value: 'variant' },
  { label: 'Product Collections', value: 'collection' },
  { label: 'Product Tags', value: 'tag' },
];

const defaultForm = {
  label: '',
  description: '',
  placeholder: '',
  helpText: '',
  fieldType: 'image',
  required: false,
  buttonText: 'Upload File',
  maxFileSizeMb: 10,
  minFileSizeMb: 0,
  maxFiles: 1,
  allowedExtensions: [] as string[],
  assignmentType: 'product',
  assignedResourceIds: [] as string[],
  assignedTags: [] as string[],
  // Image validation
  minWidth: '',
  maxWidth: '',
  minHeight: '',
  maxHeight: '',
  requiredAspectRatio: '',
  enableCropping: false,
  enableRotation: false,
  enablePreview: false,
  previewTemplateUrl: '' as string,
  previewPlacement: { x: 25, y: 25, width: 50, height: 50 },
  allowCustomerPositioning: false,
  allowCustomerText: false,
  isActive: true,
};

export function UploadFieldFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const queryClient = useQueryClient();
  const isEdit = !!id;

  const [form, setForm] = useState(defaultForm);
  const [selectedTab, setSelectedTab] = useState(0);
  const [newExtension, setNewExtension] = useState('');
  const [newTag, setNewTag] = useState('');
  const [error, setError] = useState('');

  const { data: field, isLoading } = useQuery({
    queryKey: ['upload-field', id],
    queryFn: () => api.get(`/uploads/fields/${id}`).then((r) => r.data.data),
    enabled: isEdit,
  });

  useEffect(() => {
    if (field) {
      setForm({
        ...defaultForm,
        ...field,
        minWidth: field.minWidth ?? '',
        maxWidth: field.maxWidth ?? '',
        minHeight: field.minHeight ?? '',
        maxHeight: field.maxHeight ?? '',
      });
    }
  }, [field]);

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      isEdit
        ? api.put(`/uploads/fields/${id}`, data)
        : api.post('/uploads/fields', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upload-fields'] });
      navigate('/app/fields');
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join('. ') : (msg ?? 'Failed to save upload field'));
    },
  });

  const handleSubmit = () => {
    setError('');
    if (!form.label.trim()) {
      setError('Field label is required');
      return;
    }
    saveMutation.mutate({
      ...form,
      maxFileSizeMb: form.maxFileSizeMb !== '' && form.maxFileSizeMb != null ? Number(form.maxFileSizeMb) : 10,
      minFileSizeMb: form.minFileSizeMb !== '' && form.minFileSizeMb != null ? Number(form.minFileSizeMb) : 0,
      minWidth: form.minWidth ? parseInt(String(form.minWidth)) : undefined,
      maxWidth: form.maxWidth ? parseInt(String(form.maxWidth)) : undefined,
      minHeight: form.minHeight ? parseInt(String(form.minHeight)) : undefined,
      maxHeight: form.maxHeight ? parseInt(String(form.maxHeight)) : undefined,
    });
  };

  const set = (key: string) => (value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const templateUploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post(`/uploads/fields/${id}/preview-template`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: (res) => {
      const updated = res.data.data ?? res.data;
      set('previewTemplateUrl')(updated.previewTemplateUrl);
      set('previewPlacement')(updated.previewPlacement ?? form.previewPlacement);
      queryClient.invalidateQueries({ queryKey: ['upload-field', id] });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join('. ') : (msg ?? 'Failed to upload preview template'));
    },
  });

  const handleTemplateFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) templateUploadMutation.mutate(file);
  };

  const setPlacement = (key: 'x' | 'y' | 'width' | 'height') => (value: string) => {
    const num = Math.max(0, Math.min(100, Number(value) || 0));
    setForm((prev) => ({ ...prev, previewPlacement: { ...prev.previewPlacement, [key]: num } }));
  };

  const addExtension = () => {
    const ext = newExtension.replace(/^\./, '').toLowerCase().trim();
    if (ext && !form.allowedExtensions.includes(ext)) {
      set('allowedExtensions')([...form.allowedExtensions, ext]);
    }
    setNewExtension('');
  };

  const addTag = () => {
    const tag = newTag.trim();
    if (tag && !form.assignedTags.includes(tag)) {
      set('assignedTags')([...form.assignedTags, tag]);
    }
    setNewTag('');
  };

  if (isEdit && isLoading) {
    return (
      <Page title="Edit Upload Field">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner />
        </div>
      </Page>
    );
  }

  const tabs = [
    { id: 'basic', content: 'Basic Settings' },
    { id: 'validation', content: 'Validation' },
    { id: 'assignment', content: 'Assignment' },
    ...(form.fieldType === 'image' ? [{ id: 'image', content: 'Image Settings' }] : []),
  ];

  return (
    <Page
      title={isEdit ? 'Edit Upload Field' : 'Create Upload Field'}
      breadcrumbs={[{ content: 'Upload Fields', onAction: () => navigate('/app/fields') }]}
      primaryAction={{
        content: 'Save',
        loading: saveMutation.isPending,
        onAction: handleSubmit,
      }}
      secondaryActions={[
        { content: 'Cancel', onAction: () => navigate('/app/fields') },
      ]}
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setError('')}>{error}</Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              <div style={{ padding: '20px' }}>

                {/* Tab 0: Basic Settings */}
                {selectedTab === 0 && (
                  <FormLayout>
                    <TextField
                      label="Field Label *"
                      value={form.label}
                      onChange={set('label')}
                      helpText="Displayed to customers above the upload button"
                      autoComplete="off"
                    />
                    <TextField
                      label="Description"
                      value={form.description}
                      onChange={set('description')}
                      multiline={3}
                      helpText="Optional description shown below the label"
                      autoComplete="off"
                    />
                    <TextField
                      label="Placeholder Text"
                      value={form.placeholder}
                      onChange={set('placeholder')}
                      helpText="Shown inside the upload area"
                      autoComplete="off"
                    />
                    <TextField
                      label="Help Text"
                      value={form.helpText}
                      onChange={set('helpText')}
                      helpText="Additional instructions for customers"
                      autoComplete="off"
                    />
                    <TextField
                      label="Upload Button Text"
                      value={form.buttonText}
                      onChange={set('buttonText')}
                      autoComplete="off"
                    />
                    <Select
                      label="Field Type"
                      options={FIELD_TYPES}
                      value={form.fieldType}
                      onChange={set('fieldType')}
                    />
                    <Checkbox
                      label="Required field"
                      checked={form.required}
                      onChange={set('required')}
                      helpText="Customers must upload a file to proceed"
                    />
                    <Checkbox
                      label="Active"
                      checked={form.isActive}
                      onChange={set('isActive')}
                    />
                  </FormLayout>
                )}

                {/* Tab 1: Validation */}
                {selectedTab === 1 && (
                  <FormLayout>
                    <FormLayout.Group>
                      <TextField
                        label="Max File Size (MB)"
                        type="number"
                        value={String(form.maxFileSizeMb)}
                        onChange={(v) => set('maxFileSizeMb')(parseInt(v) || 10)}
                        autoComplete="off"
                      />
                      <TextField
                        label="Min File Size (MB)"
                        type="number"
                        value={String(form.minFileSizeMb)}
                        onChange={(v) => set('minFileSizeMb')(parseInt(v) || 0)}
                        autoComplete="off"
                      />
                    </FormLayout.Group>
                    <TextField
                      label="Max Number of Files"
                      type="number"
                      value={String(form.maxFiles)}
                      onChange={(v) => set('maxFiles')(parseInt(v) || 1)}
                      min={1}
                      max={50}
                      autoComplete="off"
                    />
                    <div>
                      <Text variant="bodyMd" as="p" fontWeight="semibold">Allowed Extensions</Text>
                      <Text variant="bodySm" tone="subdued" as="p">Leave empty to allow all types for this field</Text>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <TextField
                          label=""
                          labelHidden
                          value={newExtension}
                          onChange={setNewExtension}
                          placeholder=".jpg or jpg"
                          onKeyPress={(e: any) => e.key === 'Enter' && addExtension()}
                          autoComplete="off"
                          connectedRight={<Button onClick={addExtension}>Add</Button>}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                        {form.allowedExtensions.map((ext) => (
                          <Tag key={ext} onRemove={() =>
                            set('allowedExtensions')(form.allowedExtensions.filter((e) => e !== ext))
                          }>
                            .{ext}
                          </Tag>
                        ))}
                      </div>
                    </div>
                  </FormLayout>
                )}

                {/* Tab 2: Assignment */}
                {selectedTab === 2 && (
                  <FormLayout>
                    <Select
                      label="Assign To"
                      options={ASSIGNMENT_TYPES}
                      value={form.assignmentType}
                      onChange={set('assignmentType')}
                    />
                    {form.assignmentType === 'tag' && (
                      <div>
                        <Text variant="bodyMd" as="p" fontWeight="semibold">Product Tags</Text>
                        <Text variant="bodySm" tone="subdued" as="p">Show this field for products with these tags</Text>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                          <TextField
                            label=""
                            labelHidden
                            value={newTag}
                            onChange={setNewTag}
                            placeholder="e.g. custom, personalized"
                            onKeyPress={(e: any) => e.key === 'Enter' && addTag()}
                            autoComplete="off"
                            connectedRight={<Button onClick={addTag}>Add Tag</Button>}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                          {form.assignedTags.map((tag) => (
                            <Tag key={tag} onRemove={() =>
                              set('assignedTags')(form.assignedTags.filter((t) => t !== tag))
                            }>
                              {tag}
                            </Tag>
                          ))}
                        </div>
                      </div>
                    )}
                    {(form.assignmentType === 'product' || form.assignmentType === 'variant' || form.assignmentType === 'collection') && (
                      <Banner tone="info">
                        After saving, you can assign specific {form.assignmentType === 'product' ? 'products' : form.assignmentType === 'variant' ? 'variants' : 'collections'} from the field detail page using the Shopify product picker.
                      </Banner>
                    )}
                  </FormLayout>
                )}

                {/* Tab 3: Image Settings */}
                {selectedTab === 3 && form.fieldType === 'image' && (
                  <FormLayout>
                    <Text variant="headingSm" as="h3">Dimension Constraints</Text>
                    <FormLayout.Group>
                      <TextField label="Min Width (px)" type="number" value={String(form.minWidth)} onChange={set('minWidth')} autoComplete="off" />
                      <TextField label="Max Width (px)" type="number" value={String(form.maxWidth)} onChange={set('maxWidth')} autoComplete="off" />
                    </FormLayout.Group>
                    <FormLayout.Group>
                      <TextField label="Min Height (px)" type="number" value={String(form.minHeight)} onChange={set('minHeight')} autoComplete="off" />
                      <TextField label="Max Height (px)" type="number" value={String(form.maxHeight)} onChange={set('maxHeight')} autoComplete="off" />
                    </FormLayout.Group>
                    <TextField
                      label="Required Aspect Ratio"
                      value={form.requiredAspectRatio}
                      onChange={set('requiredAspectRatio')}
                      placeholder="e.g. 16:9 or 1:1"
                      helpText="Leave empty to allow any aspect ratio"
                      autoComplete="off"
                    />
                    <Text variant="headingSm" as="h3">Image Editor</Text>
                    <Checkbox
                      label="Enable image cropping"
                      checked={form.enableCropping}
                      onChange={set('enableCropping')}
                      helpText="Customers can crop their image before uploading"
                    />
                    <Checkbox
                      label="Enable image rotation"
                      checked={form.enableRotation}
                      onChange={set('enableRotation')}
                    />

                    <Text variant="headingSm" as="h3">Product Preview</Text>
                    <Checkbox
                      label="Enable product preview"
                      checked={form.enablePreview}
                      onChange={set('enablePreview')}
                      helpText="Customers see their uploaded image composited onto a product mockup before submitting, so they can confirm it looks right."
                    />

                    {form.enablePreview && (
                      <BlockStack gap="200">
                        <Checkbox
                          label="Allow customers to reposition their image"
                          checked={form.allowCustomerPositioning}
                          onChange={set('allowCustomerPositioning')}
                          helpText="Instead of a fixed placement, customers can drag, resize, and rotate their image on the mockup themselves — like a full design tool."
                        />
                        <Checkbox
                          label="Allow customers to add their own text"
                          checked={form.allowCustomerText}
                          onChange={set('allowCustomerText')}
                          helpText="Adds a text tool so customers can add a name or short message onto their design."
                        />
                      </BlockStack>
                    )}

                    {form.enablePreview && !isEdit && (
                      <Banner tone="info">
                        Save this field first, then come back to upload a mockup/template image.
                      </Banner>
                    )}

                    {form.enablePreview && isEdit && (
                      <BlockStack gap="300">
                        <div>
                          <Text variant="bodyMd" fontWeight="medium" as="p">Mockup template image</Text>
                          <Text variant="bodySm" tone="subdued" as="p">
                            A photo of the blank product (e.g. a plain t-shirt). The customer's image will be
                            overlaid on top of it.
                          </Text>
                          <div style={{ marginTop: 8 }}>
                            <input type="file" accept="image/*" onChange={handleTemplateFileChange} />
                          </div>
                          {templateUploadMutation.isPending && <Spinner size="small" />}
                        </div>

                        {form.previewTemplateUrl && (
                          <div>
                            <Text variant="bodyMd" fontWeight="medium" as="p">
                              {form.allowCustomerPositioning ? 'Starting position (% of template)' : 'Placement (% of template)'}
                            </Text>
                            {form.allowCustomerPositioning && (
                              <Text variant="bodySm" tone="subdued" as="p">
                                Customers can move this — these values just set where their image starts out.
                              </Text>
                            )}
                            <div
                              style={{
                                position: 'relative',
                                width: '100%',
                                maxWidth: 400,
                                marginTop: 8,
                                border: '1px solid #E3E5E4',
                                borderRadius: 8,
                                overflow: 'hidden',
                              }}
                            >
                              <img
                                src={form.previewTemplateUrl}
                                alt="Mockup template"
                                style={{ display: 'block', width: '100%', height: 'auto' }}
                              />
                              <div
                                style={{
                                  position: 'absolute',
                                  left: `${form.previewPlacement.x}%`,
                                  top: `${form.previewPlacement.y}%`,
                                  width: `${form.previewPlacement.width}%`,
                                  height: `${form.previewPlacement.height}%`,
                                  border: '2px dashed #008060',
                                  background: 'rgba(0,128,96,0.12)',
                                  boxSizing: 'border-box',
                                }}
                              />
                            </div>

                            <FormLayout.Group>
                              <TextField
                                label="X (%)" type="number" autoComplete="off"
                                value={String(form.previewPlacement.x)}
                                onChange={setPlacement('x')}
                              />
                              <TextField
                                label="Y (%)" type="number" autoComplete="off"
                                value={String(form.previewPlacement.y)}
                                onChange={setPlacement('y')}
                              />
                            </FormLayout.Group>
                            <FormLayout.Group>
                              <TextField
                                label="Width (%)" type="number" autoComplete="off"
                                value={String(form.previewPlacement.width)}
                                onChange={setPlacement('width')}
                              />
                              <TextField
                                label="Height (%)" type="number" autoComplete="off"
                                value={String(form.previewPlacement.height)}
                                onChange={setPlacement('height')}
                              />
                            </FormLayout.Group>
                          </div>
                        )}
                      </BlockStack>
                    )}
                  </FormLayout>
                )}
              </div>
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
