import React, { useState, useEffect } from 'react';
import {
  Page, Layout, Card, FormLayout, TextField, Select,
  ColorPicker, RangeSlider, Button, Banner, Toast, Frame,
  Checkbox, Text, Spinner,
} from '@shopify/polaris';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';

const LANGUAGES = [
  { label: 'English', value: 'en' },
  { label: 'Spanish', value: 'es' },
  { label: 'German', value: 'de' },
  { label: 'French', value: 'fr' },
  { label: 'Italian', value: 'it' },
  { label: 'Japanese', value: 'ja' },
];

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [toastActive, setToastActive] = useState(false);
  const [form, setForm] = useState({
    buttonColor: '#008060',
    buttonText: 'Upload File',
    buttonBorderRadius: 4,
    language: 'en',
    notifyMerchantOnUpload: true,
    notificationEmail: '',
    notifyCustomerOnUpload: false,
    signedUrlExpirySeconds: 3600,
    customCss: '',
    customMessages: {
      fileTooLarge: '',
      fileTypeNotAllowed: '',
      uploadSuccess: '',
      uploadError: '',
    },
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data.data),
  });

  useEffect(() => {
    if (settings) {
      setForm((prev) => ({ ...prev, ...settings }));
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data: any) => api.put('/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setToastActive(true);
    },
  });

  const set = (key: string) => (value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setCustomMessage = (key: string) => (value: string) =>
    setForm((prev) => ({
      ...prev,
      customMessages: { ...prev.customMessages, [key]: value },
    }));

  if (isLoading) {
    return (
      <Page title="Settings">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner />
        </div>
      </Page>
    );
  }

  return (
    <Frame>
      {toastActive && (
        <Toast content="Settings saved" onDismiss={() => setToastActive(false)} />
      )}
      <Page
        title="Settings"
        primaryAction={{
          content: 'Save Settings',
          loading: saveMutation.isPending,
          onAction: () => saveMutation.mutate(form),
        }}
      >
        <Layout>
          {/* Appearance */}
          <Layout.Section>
          <div style={{marginBottom:"8px"}}><Text variant="headingMd" as="h2">Appearance</Text><Text variant="bodySm" tone="subdued" as="p">Customize how the upload widget looks in your store.</Text></div>
            <Card>
              <div style={{ padding: '20px' }}>
                <FormLayout>
                  <TextField
                    label="Upload Button Text"
                    value={form.buttonText}
                    onChange={set('buttonText')}
                    autoComplete="off"
                  />
                  <TextField
                    label="Button Color (hex)"
                    value={form.buttonColor}
                    onChange={set('buttonColor')}
                    autoComplete="off"
                    prefix={
                      <div style={{
                        width: '20px', height: '20px',
                        background: form.buttonColor,
                        borderRadius: '3px',
                        border: '1px solid #ddd',
                      }} />
                    }
                    helpText="e.g. #008060 for Shopify green"
                  />
                  <div>
                    <Text variant="bodyMd" as="p">Button Border Radius: {form.buttonBorderRadius}px</Text>
                    <RangeSlider
                      label="Border radius"
                      labelHidden
                      value={form.buttonBorderRadius}
                      onChange={set('buttonBorderRadius')}
                      min={0}
                      max={24}
                      step={1}
                    />
                  </div>
                  {/* Live preview */}
                  <div>
                    <Text variant="bodySm" tone="subdued" as="p">Preview</Text>
                    <button
                      style={{
                        background: form.buttonColor,
                        color: 'white',
                        border: 'none',
                        borderRadius: `${form.buttonBorderRadius}px`,
                        padding: '10px 20px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        marginTop: '8px',
                      }}
                    >
                      {form.buttonText}
                    </button>
                  </div>
                </FormLayout>
              </div>
            </Card>
          </Layout.Section>

          {/* Language */}
          <Layout.Section>
          <div style={{marginBottom:"8px"}}><Text variant="headingMd" as="h2">Language</Text><Text variant="bodySm" tone="subdued" as="p">Choose the language for your upload widget.</Text></div>
            <Card>
              <div style={{ padding: '20px' }}>
                <Select
                  label="Widget Language"
                  options={LANGUAGES}
                  value={form.language}
                  onChange={set('language')}
                />
              </div>
            </Card>
          </Layout.Section>

          {/* Notifications */}
          <Layout.Section>
          <div style={{marginBottom:"8px"}}><Text variant="headingMd" as="h2">Notifications</Text><Text variant="bodySm" tone="subdued" as="p">Configure email notifications for uploads.</Text></div>
            <Card>
              <div style={{ padding: '20px' }}>
                <FormLayout>
                  <Checkbox
                    label="Notify me when a customer uploads a file"
                    checked={form.notifyMerchantOnUpload}
                    onChange={set('notifyMerchantOnUpload')}
                  />
                  {form.notifyMerchantOnUpload && (
                    <TextField
                      label="Notification Email"
                      type="email"
                      value={form.notificationEmail}
                      onChange={set('notificationEmail')}
                      autoComplete="email"
                      helpText="Leave empty to use your store email"
                    />
                  )}
                  <Checkbox
                    label="Send customers a confirmation email after upload"
                    checked={form.notifyCustomerOnUpload}
                    onChange={set('notifyCustomerOnUpload')}
                  />
                </FormLayout>
              </div>
            </Card>
          </Layout.Section>

          {/* Custom Error Messages */}
          <Layout.Section>
          <div style={{marginBottom:"8px"}}><Text variant="headingMd" as="h2">Custom Messages</Text><Text variant="bodySm" tone="subdued" as="p">Override default messages shown to customers.</Text></div>
            <Card>
              <div style={{ padding: '20px' }}>
                <FormLayout>
                  <TextField
                    label="File Too Large"
                    value={form.customMessages.fileTooLarge}
                    onChange={setCustomMessage('fileTooLarge')}
                    placeholder="Default: File size exceeds the limit"
                    autoComplete="off"
                  />
                  <TextField
                    label="File Type Not Allowed"
                    value={form.customMessages.fileTypeNotAllowed}
                    onChange={setCustomMessage('fileTypeNotAllowed')}
                    placeholder="Default: This file type is not allowed"
                    autoComplete="off"
                  />
                  <TextField
                    label="Upload Success"
                    value={form.customMessages.uploadSuccess}
                    onChange={setCustomMessage('uploadSuccess')}
                    placeholder="Default: File uploaded successfully"
                    autoComplete="off"
                  />
                  <TextField
                    label="Upload Error"
                    value={form.customMessages.uploadError}
                    onChange={setCustomMessage('uploadError')}
                    placeholder="Default: Upload failed. Please try again."
                    autoComplete="off"
                  />
                </FormLayout>
              </div>
            </Card>
          </Layout.Section>

          {/* Custom CSS */}
          <Layout.Section>
          <div style={{marginBottom:"8px"}}><Text variant="headingMd" as="h2">Custom CSS</Text><Text variant="bodySm" tone="subdued" as="p">Add your own CSS to restyle the upload widget on your storefront. Rules are automatically scoped to the widget, so they can't affect the rest of your theme.</Text></div>
            <Card>
              <div style={{ padding: '20px' }}>
                <FormLayout>
                  <TextField
                    label="Custom CSS"
                    labelHidden
                    value={form.customCss}
                    onChange={set('customCss')}
                    multiline={10}
                    autoComplete="off"
                    placeholder={`.cfup-dropzone {\n  border-color: #6b46c1;\n  background: #faf5ff;\n}\n\n.cfup-button {\n  text-transform: uppercase;\n  letter-spacing: 0.5px;\n}`}
                    helpText="Target widget classes such as .cfup-widget, .cfup-button, .cfup-dropzone, .cfup-file-item. Changes apply the next time the widget loads on your storefront."
                  />
                </FormLayout>
              </div>
            </Card>
          </Layout.Section>

          {/* Security */}
          <Layout.Section>
          <div style={{marginBottom:"8px"}}><Text variant="headingMd" as="h2">Security</Text><Text variant="bodySm" tone="subdued" as="p">Configure download link expiry.</Text></div>
            <Card>
              <div style={{ padding: '20px' }}>
                <Select
                  label="Download Link Expiry"
                  value={String(form.signedUrlExpirySeconds)}
                  onChange={(v) => set('signedUrlExpirySeconds')(parseInt(v))}
                  options={[
                    { label: '1 hour', value: '3600' },
                    { label: '6 hours', value: '21600' },
                    { label: '24 hours', value: '86400' },
                    { label: '7 days', value: '604800' },
                  ]}
                  helpText="How long download links remain valid"
                />
              </div>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}
