import React from 'react';
import {
  Page, Layout, Card, Text, Grid, Spinner, Banner,
  DataTable, Badge,
} from '@shopify/polaris';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts';
import { api } from '../utils/api';
import { formatBytes } from '../utils/format';

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

export function DashboardPage() {
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

  return (
    <Page
      title="Dashboard"
      subtitle="Monitor your file upload activity"
    >
      <Layout>
        {/* Stats Row */}
        <Layout.Section>
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
                        <stop offset="5%" stopColor="#008060" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#008060" stopOpacity={0} />
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
                      stroke="#008060"
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
              <div style={{ marginTop: '16px', height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData ?? []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Uploads" fill="#008060" radius={[3, 3, 0, 0]} />
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
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatBytes(v, 0)} />
                    <Tooltip formatter={(v: number) => formatBytes(v)} />
                    <Area
                      type="monotone"
                      dataKey="bytes"
                      name="Storage"
                      stroke="#5c6ac4"
                      fill="#f4f5fa"
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
