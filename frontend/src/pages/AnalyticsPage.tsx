import React from 'react';
import {
  Page, Layout, Card, Text, Grid, Spinner, Select, Box,
} from '@shopify/polaris';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { api } from '../utils/api';
import { formatBytes } from '../utils/format';

const MIME_COLORS = ['#008060','#5c6ac4','#e7850a','#de3618','#47c1bf','#f49342'];

function StatCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <Card>
      <Box padding="400">
        <Text variant="bodySm" tone="subdued" as="p">{title}</Text>
        <Text variant="heading2xl" as="p">{value}</Text>
        {sub && <Text variant="bodySm" tone="subdued" as="p">{sub}</Text>}
      </Box>
    </Card>
  );
}

export function AnalyticsPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['analytics', 'stats'],
    queryFn: () => api.get('/analytics/stats').then(r => r.data.data),
  });

  const { data: daily } = useQuery({
    queryKey: ['analytics', 'daily'],
    queryFn: () => api.get('/analytics/daily-uploads').then(r => r.data.data),
  });

  const { data: storageGrowth } = useQuery({
    queryKey: ['analytics', 'storage-growth'],
    queryFn: () => api.get('/analytics/storage-growth').then(r => r.data.data),
  });

  const { data: byType } = useQuery({
    queryKey: ['analytics', 'by-type'],
    queryFn: () => api.get('/analytics/by-type').then(r => r.data.data),
  });

  const { data: topFields } = useQuery({
    queryKey: ['analytics', 'top-fields'],
    queryFn: () => api.get('/analytics/top-fields').then(r => r.data.data),
  });

  if (isLoading) return (
    <Page title="Analytics">
      <Box padding="800"><Spinner /></Box>
    </Page>
  );

  return (
    <Page title="Analytics" subtitle="Detailed upload and storage analytics">
      <Layout>
        {/* Summary stats */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 2, lg: 2, xl: 2 }}>
              <StatCard title="Total uploads" value={String(stats?.totalUploads ?? 0)} />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 2, lg: 2, xl: 2 }}>
              <StatCard title="This month" value={String(stats?.uploadsThisMonth ?? 0)} />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 2, lg: 2, xl: 2 }}>
              <StatCard title="Today" value={String(stats?.uploadsToday ?? 0)} />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 2, lg: 2, xl: 2 }}>
              <StatCard title="Storage used" value={formatBytes(stats?.storageUsedBytes ?? 0)} />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 2, lg: 2, xl: 2 }}>
              <StatCard title="Infected files" value={String(stats?.infectedFiles ?? 0)} />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 2, lg: 2, xl: 2 }}>
              <StatCard title="Active fields" value={String(stats?.activeFields ?? 0)} />
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Daily uploads chart */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <Text variant="headingMd" as="h2">Daily uploads — last 30 days</Text>
            </Box>
            <Box padding="400">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={daily ?? []}>
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#008060" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#008060" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="count" name="Uploads"
                    stroke="#008060" fill="url(#grad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </Card>
        </Layout.Section>

        {/* File type breakdown */}
        <Layout.Section variant="oneHalf">
          <Card>
            <Box padding="400">
              <Text variant="headingMd" as="h2">Uploads by file type</Text>
            </Box>
            <Box padding="400">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={byType ?? []} dataKey="count" nameKey="mimeType"
                    cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`}>
                    {(byType ?? []).map((_: any, i: number) => (
                      <Cell key={i} fill={MIME_COLORS[i % MIME_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </Card>
        </Layout.Section>

        {/* Top upload fields */}
        <Layout.Section variant="oneHalf">
          <Card>
            <Box padding="400">
              <Text variant="headingMd" as="h2">Top upload fields</Text>
            </Box>
            <Box padding="400">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topFields ?? []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="count" name="Uploads" fill="#5c6ac4" radius={[0,3,3,0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Card>
        </Layout.Section>

        {/* Storage growth */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <Text variant="headingMd" as="h2">Storage growth</Text>
            </Box>
            <Box padding="400">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={storageGrowth ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }}
                    tickFormatter={v => formatBytes(v, 0)} />
                  <Tooltip formatter={(v: number) => formatBytes(v)} />
                  <Area type="monotone" dataKey="bytes" name="Storage"
                    stroke="#5c6ac4" fill="#f4f5fa" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
