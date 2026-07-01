import React, { useEffect, useState } from 'react';
import {
  Page, Layout, Card, Text, Badge, Button, Banner,
  List, Spinner, BlockStack, InlineStack,
} from '@shopify/polaris';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';
import { formatBytes } from '../utils/format';

const PLAN_FEATURES: Record<string, string[]> = {
  free: [
    '100 uploads/month',
    '1 GB storage',
    '10 MB max file size',
    'Basic file types',
    'Email support',
  ],
  starter: [
    '1,000 uploads/month',
    '10 GB storage',
    '100 MB max file size',
    'All file types',
    'Image editor (crop, rotate)',
    'Priority email support',
  ],
  pro: [
    'Unlimited uploads',
    '100 GB storage',
    '2 GB max file size',
    'All file types',
    'Image editor (crop, rotate)',
    'Image validation (dimensions, aspect ratio)',
    'Conditional upload logic',
    'Priority support + Slack',
  ],
};

function PlanCard({
  plan, currentPlanName, onSelect, isLoading, disabled, trialDays,
}: {
  plan: any;
  currentPlanName: string;
  onSelect: () => void;
  isLoading: boolean;
  disabled?: boolean;
  trialDays: number;
}) {
  const isCurrent = plan.name === currentPlanName;
  const isPro = plan.name === 'pro';

  return (
    <Card>
      <div style={{ padding: '24px', position: 'relative' }}>
        {isPro && (
          <div style={{
            position: 'absolute', top: -1, right: -1,
            background: '#008060', color: 'white',
            padding: '4px 12px', borderRadius: '0 8px 0 8px',
            fontSize: '12px', fontWeight: 600,
          }}>
            MOST POPULAR
          </div>
        )}
        <BlockStack gap="400">
          <div>
            <Text variant="headingLg" as="h3">{plan.displayName}</Text>
            <div style={{ marginTop: '8px' }}>
              <Text variant="heading2xl" as="p">
                {plan.monthlyPrice === 0 ? 'Free' : `$${plan.monthlyPrice}`}
              </Text>
              {plan.monthlyPrice > 0 && (
                <Text variant="bodySm" tone="subdued" as="p">per month</Text>
              )}
            </div>
          </div>

          <List>
            {(PLAN_FEATURES[plan.name] ?? []).map((f) => (
              <List.Item key={f}>{f}</List.Item>
            ))}
          </List>

          {isCurrent ? (
            <Badge tone="success" >Current Plan</Badge>
          ) : (
            <Button
              primary={isPro}
              fullWidth
              loading={isLoading}
              disabled={disabled && !isLoading}
              onClick={onSelect}
            >
              {plan.monthlyPrice === 0 ? 'Downgrade to Free' : `Upgrade to ${plan.displayName}`}
            </Button>
          )}

          {plan.monthlyPrice > 0 && !isCurrent && (
            <Text variant="bodySm" tone="subdued" as="p" alignment="center">
              {trialDays}-day free trial • Cancel anytime
            </Text>
          )}
        </BlockStack>
      </div>
    </Card>
  );
}

export function BillingPage() {
  const queryClient = useQueryClient();

  // If the merchant just approved (or declined) a Shopify checkout, this
  // verifies the real status with Shopify and promotes our PENDING row to
  // ACTIVE if appropriate. Safe to call even when nothing is pending.
  useEffect(() => {
    api.get('/billing/activate')
      .then(() => queryClient.invalidateQueries({ queryKey: ['current-plan'] }))
      .catch(() => { /* nothing pending, or check failed — current-plan still reflects reality */ });
  }, []);

  const { data: plansResponse, isLoading: plansLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/billing/plans').then((r) => r.data.data),
  });
  const plansData = plansResponse?.plans ?? [];
  const defaultTrialDays = plansResponse?.defaultTrialDays ?? 14;

  const { data: currentPlanData, isLoading: currentLoading } = useQuery({
    queryKey: ['current-plan'],
    queryFn: () => api.get('/billing/current').then((r) => r.data.data),
  });

  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const upgradeMutation = useMutation({
    mutationFn: (planName: string) =>
      api.post('/billing/subscribe', { planName }).then((r) => r.data.data),
    onSuccess: ({ confirmationUrl }) => {
      setUpgradeError(null);
      if (confirmationUrl) window.location.href = confirmationUrl;
    },
    onError: (err: any) => {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Could not start checkout. Please try again.';
      setUpgradeError(Array.isArray(message) ? message.join(', ') : message);
    },
  });
  // useMutation only tracks one global isPending flag, shared across every
  // call to mutate() — it doesn't know which plan triggered it. Without
  // this, clicking "Starter" would also show a loading spinner on "Pro"
  // (and any other plan card), since they all read the same isPending.
  const pendingPlanName = upgradeMutation.isPending
    ? (upgradeMutation.variables as string | undefined)
    : undefined;

  if (plansLoading || currentLoading) {
    return (
      <Page title="Plan & Billing">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner />
        </div>
      </Page>
    );
  }

  const currentPlan = currentPlanData?.plan;
  const subscription = currentPlanData?.subscription;

  return (
    <Page title="Plan & Billing" subtitle="Choose the right plan for your store">
      <Layout>
        {upgradeError && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setUpgradeError(null)}>
              {upgradeError}
            </Banner>
          </Layout.Section>
        )}

        {subscription?.status === 'trial' && (
          <Layout.Section>
            <Banner tone="info">
              You are on a{' '}
              {subscription.trialStartsAt && subscription.trialEndsAt
                ? Math.round(
                    (new Date(subscription.trialEndsAt).getTime() -
                      new Date(subscription.trialStartsAt).getTime()) /
                      (24 * 60 * 60 * 1000),
                  )
                : defaultTrialDays}
              -day free trial. Trial ends on{' '}
              {subscription.trialEndsAt
                ? new Date(subscription.trialEndsAt).toLocaleDateString()
                : '—'}
              .
            </Banner>
          </Layout.Section>
        )}

        {/* Current usage */}
        {currentPlan && (
          <Layout.Section>
            <Card>
              <div style={{ padding: '20px' }}>
                <Text variant="headingMd" as="h2">Current Usage</Text>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginTop: '16px' }}>
                  <div>
                    <Text variant="bodySm" tone="subdued" as="p">Monthly Uploads</Text>
                    <Text variant="headingLg" as="p">
                      {currentPlanData?.monthlyUploads ?? 0}
                      {currentPlan.uploadsPerMonth !== -1 && ` / ${currentPlan.uploadsPerMonth}`}
                    </Text>
                  </div>
                  <div>
                    <Text variant="bodySm" tone="subdued" as="p">Storage Used</Text>
                    <Text variant="headingLg" as="p">
                      {formatBytes(currentPlanData?.storageUsedBytes ?? 0)} / {formatBytes(currentPlan.storageBytes)}
                    </Text>
                  </div>
                  <div>
                    <Text variant="bodySm" tone="subdued" as="p">Current Plan</Text>
                    <Text variant="headingLg" as="p">{currentPlan.displayName}</Text>
                  </div>
                </div>
              </div>
            </Card>
          </Layout.Section>
        )}

        {/* Plan cards */}
        <Layout.Section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {(plansData ?? []).map((plan: any) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                currentPlanName={currentPlan?.name ?? 'free'}
                onSelect={() => upgradeMutation.mutate(plan.name)}
                isLoading={pendingPlanName === plan.name}
                disabled={upgradeMutation.isPending}
                trialDays={defaultTrialDays}
              />
            ))}
          </div>
        </Layout.Section>

        {/* Billing info */}
        {subscription && subscription.status !== 'trial' && (
          <Layout.Section>
            <Card>
              <div style={{ padding: '20px' }}>
                <Text variant="headingMd" as="h2">Billing Information</Text>
                <div style={{ marginTop: '12px' }}>
                  <Text variant="bodyMd" as="p">
                    Next billing date:{' '}
                    {subscription.currentPeriodEnd
                      ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                      : '—'}
                  </Text>
                  <Text variant="bodyMd" as="p" tone="subdued">
                    Billing is handled through your Shopify account.
                  </Text>
                </div>
              </div>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
