import { Logger } from '@nestjs/common';
import axios from 'axios';

/**
 * COPY THIS FILE to backend/src/billing/dev-store.util.ts
 *
 * Authoritative development-store detection, used to decide test-vs-live
 * charges. See WHERE-THINGS-GO.md for the full rationale; in short, the
 * current install-time string match
 *
 *   const devStorePlanNames = ['affiliate', 'partner_test', 'staff'];
 *   const isDevelopmentStore = devStorePlanNames.includes(shopInfo.plan_name);
 *
 * misses dev stores whose plan_name isn't one of those three, and never
 * updates after install. A missed detection creates a LIVE charge on a store
 * with no payment method, which dead-ends at Shopify's billing settings with
 * errorHint=client_api_error.
 */

const logger = new Logger('DevStoreDetection');

const SHOP_PLAN_QUERY = `
  query FiledropShopPlan {
    shop {
      name
      myshopifyDomain
      plan { displayName partnerDevelopment shopifyPlus }
    }
  }
`;

export interface ShopPlanInfo {
  displayName: string;
  partnerDevelopment: boolean;
  shopifyPlus: boolean;
}

export async function fetchShopPlanInfo(
  shopDomain: string,
  accessToken: string,
  apiVersion = '2026-07',
): Promise<ShopPlanInfo | null> {
  try {
    const response = await axios.post(
      `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`,
      { query: SHOP_PLAN_QUERY },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      },
    );

    if (response.data?.errors?.length) {
      logger.error(
        `shop plan query failed for ${shopDomain}: ${JSON.stringify(response.data.errors)}`,
      );
      return null;
    }

    const plan = response.data?.data?.shop?.plan;
    if (!plan) return null;

    return {
      displayName: plan.displayName ?? 'unknown',
      partnerDevelopment: Boolean(plan.partnerDevelopment),
      shopifyPlus: Boolean(plan.shopifyPlus),
    };
  } catch (err: any) {
    logger.error(`shop plan lookup threw for ${shopDomain}: ${err?.message}`);
    return null;
  }
}

export interface TestChargeDecision {
  test: boolean;
  reason:
    | 'env_forced_test'
    | 'graphql_partner_development'
    | 'stored_flag'
    | 'plan_name_fallback'
    | 'live_store';
  planDisplayName: string | null;
}

export async function decideTestCharge(options: {
  shopDomain: string;
  accessToken: string;
  storedIsDevelopmentStore: boolean;
  storedPlanName?: string | null;
  apiVersion?: string;
}): Promise<TestChargeDecision> {
  if (process.env.SHOPIFY_BILLING_TEST_MODE === 'true') {
    return { test: true, reason: 'env_forced_test', planDisplayName: null };
  }

  const info = await fetchShopPlanInfo(
    options.shopDomain,
    options.accessToken,
    options.apiVersion,
  );

  if (info?.partnerDevelopment) {
    return {
      test: true,
      reason: 'graphql_partner_development',
      planDisplayName: info.displayName,
    };
  }

  if (options.storedIsDevelopmentStore) {
    return {
      test: true,
      reason: 'stored_flag',
      planDisplayName: info?.displayName ?? options.storedPlanName ?? null,
    };
  }

  const devStorePlanNames = [
    'affiliate',
    'partner_test',
    'staff',
    'staff_business',
    'developer_preview',
    'plus_partner_sandbox',
  ];
  const planName = (info?.displayName ?? options.storedPlanName ?? '').toLowerCase();
  if (devStorePlanNames.includes(planName)) {
    return { test: true, reason: 'plan_name_fallback', planDisplayName: planName };
  }

  return {
    test: false,
    reason: 'live_store',
    planDisplayName: info?.displayName ?? options.storedPlanName ?? null,
  };
}
