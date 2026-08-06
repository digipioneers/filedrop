import React from 'react';
import {
  Page, Layout, Card, Text, Grid, Spinner, Banner,
  DataTable, Badge, Button, InlineStack, BlockStack, Box, Link,
} from '@shopify/polaris';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { api } from '../utils/api';
import { formatBytes } from '../utils/format';

const BRAND = '#6A47F5';

function StatCard({
  title, value, helpText,
}: {
  title: string; value: string | number; helpText?: string;
}) {
  return (
    <Card>
      <div style={{ padding: '16px' }}>
        <Text variant="headingMd" as="h3" tone="subdued">{title}</Text>
        <div style={{ marginTop: '8px' }}>
          <Text variant="heading2xl" as="p">{value}</Text>
        </div>
        {helpText && (
          <div style={{ marginTop: '4px' }}>
            <Text variant="bodySm" tone="subdued">{helpText}</Text>
          </div>
        )}
      </div>
    </Card>
  );
}

/** One row of the "Get started" checklist. */
function ChecklistStep({
  done, title, description, actionLabel, onAction,
}: {
  done: boolean;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Box paddingBlock="300">
      <InlineStack gap="300" blockAlign="start" wrap={false}>
        <div
          style={{
            marginTop: 2,
            flexShrink: 0,
            width: 22,
            height: 22,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            color: '#fff',
            background: done ? '#1a7f37' : BRAND,
          }}
        >
          {done ? '✓' : '→'}
        </div>
        <BlockStack gap="100">
          <Text variant="headingSm" as="h3">{title}</Text>
          <Text variant="bodySm" tone="subdued" as="p">{description}</Text>
          {actionLabel && onAction && (
            <div style={{ marginTop: 4 }}>
              <Button onClick={onAction} variant="primary" size="slim">
                {actionLabel}
              </Button>
            </div>
          )}
        </BlockStack>
      </InlineStack>
    </Box>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => api.get('/dashboard/stats').then((r) => r.data.data),
  });

  const { data: dailyData } = useQuery({
    queryKey: ['dashboard', 'daily'],
    queryFn: () => api.get('/dashboard/daily-uploads').then((r) => r.data.data),
  });

  const { data: monthlyData } = useQuery({
    queryKey: ['dashboard', 'monthly'],
    queryFn: () => api.get('/dashboard/monthly-uploads').then((r) => r.data.data),
  });

  const { data: recentUploads } = useQuery({
    queryKey: ['dashboard', 'recent'],
    queryFn: () => api.get('/dashboard/recent-uploads').then((r) => r.data.data),
  });

  const { data: storageGrowthData } = useQuery({
    queryKey: ['dashboard', 'storage-growth'],
    queryFn: () => api.get('/dashboard/storage-growth').then((r) => r.data.data),
  });

  if (statsLoading) {
    return (
      <Page title="Dashboard">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner />
        </div>
      </Page>
    );
  }

  // Derive setup progress from real data.
  const hasFields = (stats?.activeFields ?? 0) > 0;
  const hasUploads = (stats?.totalUploads ?? 0) > 0;

  return (
    <Page
      title="👋 Welcome to Filedrop"
      subtitle="Let customers upload files on your product and cart pages."
    >
      <Layout>
        {/* ── Get started checklist ─────────────────────────────────────── */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">Get started</Text>
                <Text variant="bodySm" tone="subdued" as="p">
                  Three quick steps to start collecting customer files.
                </Text>

                <Box
                  borderColor="border"
                  borderBlockStartWidth="025"
                  paddingBlockStart="200"
                >
                  <ChecklistStep
                    done={true}
                    title="Add the Filedrop block to your theme"
                    description="Open the theme editor and drop the Filedrop upload block onto your product or cart page to finish installation."
                    actionLabel="Go to theme editor"
                    onAction={() => {
                      window.open('shopify:admin/themes/current/editor', '_top');
                    }}
                  />
                  <ChecklistStep
                    done={hasFields}
                    title="Build your upload fields"
                    description="Create the fields customers will use to upload files — set file types, sizes, and which products they appear on."
                    actionLabel={hasFields ? 'Manage fields' : 'Create a field'}
                    onAction={() => navigate('/fields')}
                  />
                  <ChecklistStep
                    done={hasUploads}
                    title="Preview and go live"
                    description="Preview a field on your storefront, place a test order, and confirm the file appears on the order."
                    actionLabel="Open your store"
                    onAction={() => {
                      window.open('shopify:admin/online_store', '_top');
                    }}
                  />
                </Box>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* ── Customize ─────────────────────────────────────────────────── */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Customize Filedrop</Text>
                <Grid>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 2, lg: 4, xl: 4 }}>
                    <Link onClick={() => navigate('/fields')} removeUnderline>
                      Add or edit upload fields
                    </Link>
                  </Grid.Cell>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 2, lg: 4, xl: 4 }}>
                    <Link onClick={() => navigate('/settings')} removeUnderline>
                      Style the upload widget
                    </Link>
                  </Grid.Cell>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 2, lg: 4, xl: 4 }}>
                    <Link onClick={() => navigate('/settings')} removeUnderline>
                      Set download link expiry
                    </Link>
                  </Grid.Cell>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 2, lg: 4, xl: 4 }}>
                    <Link onClick={() => navigate('/uploads')} removeUnderline>
                      View all uploaded files
                    </Link>
                  </Grid.Cell>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 2, lg: 4, xl: 4 }}>
                    <Link onClick={() => navigate('/settings')} removeUnderline>
                      Configure file types &amp; size limits
                    </Link>
                  </Grid.Cell>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 2, lg: 4, xl: 4 }}>
                    <Link onClick={() => navigate('/billing')} removeUnderline>
                      Manage your plan
                    </Link>
                  </Grid.Cell>
                </Grid>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* ── Recent activity (stats) ───────────────────────────────────── */}
        <Layout.Section>
          <Box paddingBlockEnd="200">
            <Text variant="headingMd" as="h2">Recent activity</Text>
            <Text variant="bodySm" tone="subdued" as="p">Last 30 days</Text>
          </Box>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 2, lg: 2, xl: 2 }}>
              <StatCard title="Total Uploads" value={stats?.totalUploads?.toLocaleString() ?? 0} />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 2, lg: 2, xl: 2 }}>
              <StatCard title="Uploads Today" value={stats?.uploadsToday ?? 0} />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 2, lg: 2, xl: 2 }}>
              <StatCard title="This Month" value={stats?.uploadsThisMonth ?? 0} />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 2, lg: 2, xl: 2 }}>
              <StatCard title="Orders w/ Uploads" value={stats?.ordersWithUploads ?? 0} />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 2, lg: 2, xl: 2 }}>
              <StatCard title="Active Fields" value={stats?.activeFields ?? 0} />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 2, lg: 2, xl: 2 }}>
              <StatCard
                title="Storage Used"
                value={formatBytes(stats?.storageUsedBytes ?? 0)}
              />
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Daily uploads chart */}
        <Layout.Section>
          <Card>
            <div style={{ padding: '20px' }}>
              <Text variant="headingMd" as="h2">Daily Uploads (Last 30 Days)</Text>
              <div style={{ marginTop: '16px', height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData ?? []}>
                    <defs>
                      <linearGradient id="uploadsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={BRAND} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={BRAND} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="Uploads"
                      stroke={BRAND}
                      fill="url(#uploadsGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>
        </Layout.Section>

        {/* Monthly chart */}
        <Layout.Section variant="oneHalf">
          <Card>
            <div style={{ padding: '20px' }}>
              <Text variant="headingMd" as="h2">Monthly Uploads</Text>
              <Text variant="bodySm" tone="subdued" as="p">
                Files currently on record per month — may differ from the "This Month" total above if any uploads were later deleted
              </Text>
              <div style={{ marginTop: '16px', height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData ?? []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Uploads" fill={BRAND} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>
        </Layout.Section>

        {/* Storage growth */}
        <Layout.Section variant="oneHalf">
          <Card>
            <div style={{ padding: '20px' }}>
              <Text variant="headingMd" as="h2">Storage Growth (Last 30 Days)</Text>
              <div style={{ marginTop: '16px', height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={storageGrowthData ?? []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatBytes(v, 1)} />
                    <Tooltip formatter={(v: number) => formatBytes(v)} />
                    <Area
                      type="monotone"
                      dataKey="bytes"
                      name="Storage"
                      stroke={BRAND}
                      fill="#f4f2ff"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>
        </Layout.Section>

        {/* Recent uploads */}
        <Layout.Section>
          <Card>
            <div style={{ padding: '20px' }}>
              <Text variant="headingMd" as="h2">Recent Uploads</Text>
            </div>
            <DataTable
              columnContentTypes={['text', 'text', 'text', 'text', 'text']}
              headings={['File Name', 'Type', 'Size', 'Order', 'Status']}
              rows={(recentUploads ?? []).map((u: any) => [
                u.originalFileName,
                u.mimeType,
                formatBytes(u.fileSizeBytes),
                u.orderId ?? '—',
                <Badge tone={
                    u.status === 'clean' ? 'success' :
                    u.status === 'infected' ? 'critical' : 'attention'
                  }
                >
                  {u.status}
                </Badge>,
              ])}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
