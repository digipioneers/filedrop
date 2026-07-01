import React from 'react';
import { Banner, ProgressBar, InlineStack, BlockStack, Text, Button, Box } from '@shopify/polaris';
import { useTenantUsage, useTrialStatus } from '../../hooks/useSaaS';

function formatBytes(b: number): string {
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB`;
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(1)} KB`;
}

export function UsageBanner() {
  const { data: usage } = useTenantUsage();
  const { data: trial } = useTrialStatus();

  if (!usage) return null;

  const uploadsPct = usage.usagePercent.uploads;
  const storagePct = usage.usagePercent.storage;
  const atLimit = !usage.isWithinLimits;
  const nearLimit = uploadsPct >= 80 || storagePct >= 80;

  return (
    <BlockStack gap="300">
      {/* Trial banner */}
      {trial?.isOnTrial && trial.daysRemaining <= 7 && (
        <Banner
          tone="warning"
          title={`Free trial ends in ${trial.daysRemaining} day${trial.daysRemaining === 1 ? '' : 's'}`}
          action={{ content: 'Upgrade now', url: '/billing' }}
        >
          <Text as="p">
            After your trial ends, you'll be moved to the Free plan (100 uploads/month).
            Upgrade to keep your current limits.
          </Text>
        </Banner>
      )}

      {/* At limit */}
      {atLimit && (
        <Banner
          tone="critical"
          title="Plan limit reached — uploads are paused"
          action={{ content: 'Upgrade plan', url: '/billing' }}
        >
          <Text as="p">
            Your store has reached its monthly limit. Customers cannot upload files until
            you upgrade or the month resets.
          </Text>
        </Banner>
      )}

      {/* Near limit */}
      {!atLimit && nearLimit && (
        <Banner
          tone="warning"
          title="Approaching plan limits"
          action={{ content: 'View plans', url: '/billing' }}
          onDismiss={() => {}}
        >
          <Text as="p">You're using most of your plan quota for this month.</Text>
        </Banner>
      )}

      {/* Usage meters */}
      {(nearLimit || atLimit) && (
        <Box
          background="bg-surface"
          borderWidth="025"
          borderColor="border"
          borderRadius="200"
          padding="400"
        >
          <BlockStack gap="300">
            <Text variant="headingSm" as="h3">
              Current usage — {usage.planName.charAt(0).toUpperCase() + usage.planName.slice(1)} plan
            </Text>

            <BlockStack gap="100">
              <InlineStack align="space-between">
                <Text as="p" variant="bodySm">Monthly uploads</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {usage.uploadsThisMonth} / {usage.uploadsLimit === -1 ? '∞' : usage.uploadsLimit}
                </Text>
              </InlineStack>
              <ProgressBar
                progress={Math.min(uploadsPct, 100)}
                tone={uploadsPct >= 100 ? 'critical' : uploadsPct >= 80 ? 'highlight' : 'success'}
                size="small"
              />
            </BlockStack>

            <BlockStack gap="100">
              <InlineStack align="space-between">
                <Text as="p" variant="bodySm">Storage used</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {formatBytes(usage.storageUsedBytes)} / {formatBytes(usage.storageLimit)}
                </Text>
              </InlineStack>
              <ProgressBar
                progress={Math.min(storagePct, 100)}
                tone={storagePct >= 100 ? 'critical' : storagePct >= 80 ? 'highlight' : 'success'}
                size="small"
              />
            </BlockStack>
          </BlockStack>
        </Box>
      )}
    </BlockStack>
  );
}
