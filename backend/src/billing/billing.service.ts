import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Subscription, SubscriptionStatus } from './entities/subscription.entity';
import { Plan, PlanName } from '../plans/entities/plan.entity';
import { Merchant } from '../auth/entities/merchant.entity';
import { AppSettings } from '../admin/entities/app-settings.entity';
import { ShopifyTokenService } from '../shopify-token/shopify-token.service';
import { decideTestCharge } from './dev-store.util';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(AppSettings) private readonly appSettingsRepo: Repository<AppSettings>,
    private readonly shopifyTokenService: ShopifyTokenService,
  ) {}

  private async getDefaultTrialDays(): Promise<number> {
    const settings = await this.appSettingsRepo.findOne({ where: {} });
    return settings?.defaultTrialDays ?? 14;
  }

  async getAllPlans() {
    const plans = await this.planRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });
    const trialDays = await this.getDefaultTrialDays();
    return { plans, defaultTrialDays: trialDays };
  }

  async getCurrentPlan(merchantId: string) {
    const sub = await this.subRepo.findOne({
      where: [
        { merchantId, status: SubscriptionStatus.ACTIVE },
        { merchantId, status: SubscriptionStatus.TRIAL },
      ],
      order: { createdAt: 'DESC' },
    });
    const plan = sub
      ? await this.planRepo.findOne({ where: { id: sub.planId } })
      : await this.planRepo.findOne({ where: { isDefault: true } });

    // The frontend's "Current Usage" section reads monthlyUploads and
    // storageUsedBytes directly off this response — they were never
    // included here, so it always displayed 0 regardless of actual usage.
    const merchant = await this.merchantRepo.findOne({ where: { id: merchantId } });

    return {
      subscription: sub,
      plan,
      monthlyUploads: merchant?.monthlyUploads ?? 0,
      storageUsedBytes: Number(merchant?.storageUsedBytes ?? 0),
      totalUploads: merchant?.totalUploads ?? 0,
    };
  }

  async createSubscription(merchant: Merchant, planName: string, returnUrl: string) {
    const plan = await this.planRepo.findOne({ where: { name: planName } });
    if (!plan) throw new NotFoundException(`Plan ${planName} not found`);

    if (plan.monthlyPrice === 0) {
      const subscription = await this.activateFreePlan(merchant.id);
      // Return the SAME shape as the paid path so callers don't have to handle
      // two different response types. Free activation has no Shopify checkout,
      // so confirmationUrl is null (the frontend treats null as "no redirect,
      // already active").
      return { confirmationUrl: null, plan, subscription };
    }

    if (!merchant.accessToken) {
      throw new BadRequestException(
        'Store is not properly authenticated with Shopify. Please reinstall the app.',
      );
    }

    if (!merchant.shopDomain || !merchant.shopDomain.endsWith('.myshopify.com')) {
      throw new BadRequestException(
        `Cannot start checkout: "${merchant.shopDomain || 'unknown'}" is not a valid Shopify store domain.`,
      );
    }

    const trialDays = await this.getDefaultTrialDays();
    const accessToken = await this.shopifyTokenService.getValidAccessToken(merchant);

    // Decide test-vs-live per shop, at charge time, by asking Shopify whether
    // this is a development store (shop.plan.partnerDevelopment) rather than
    // trusting the plan-name string captured at install. A development store
    // can never hold a payment method, so a LIVE charge against one makes
    // Shopify redirect the merchant to Settings → Billing to add a card and
    // the flow dead-ends at admin.shopify.com/login?...errorHint=client_api_error.
    // The env override (SHOPIFY_BILLING_TEST_MODE=true) still forces test mode.
    const chargeDecision = await decideTestCharge({
      shopDomain: merchant.shopDomain,
      accessToken,
      storedIsDevelopmentStore: merchant.isDevelopmentStore,
      storedPlanName: merchant.shopPlanName,
    });
    const isTestCharge = chargeDecision.test;
    this.logger.log(
      `Creating ${isTestCharge ? 'TEST' : 'LIVE'} charge for ${merchant.shopDomain} ` +
        `(plan: ${plan.displayName}, reason: ${chargeDecision.reason})`,
    );

    // Ask Shopify itself to create the subscription and hand back a real,
    // signed confirmation URL. We must never build this URL ourselves —
    // there is no public "admin/charges/app_subscriptions/new" route;
    // that legacy pattern 404s on current Shopify admin.
    const mutation = `
      mutation AppSubscriptionCreate(
        $name: String!,
        $returnUrl: URL!,
        $trialDays: Int,
        $test: Boolean,
        $lineItems: [AppSubscriptionLineItemInput!]!
      ) {
        appSubscriptionCreate(
          name: $name,
          returnUrl: $returnUrl,
          trialDays: $trialDays,
          test: $test,
          lineItems: $lineItems
        ) {
          userErrors { field message }
          confirmationUrl
          appSubscription { id }
        }
      }
    `;

    const variables = {
      name: plan.displayName,
      returnUrl,
      trialDays,
      test: isTestCharge,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: Number(plan.monthlyPrice), currencyCode: 'USD' },
              interval: 'EVERY_30_DAYS',
            },
          },
        },
      ],
    };

    let response;
    try {
      response = await axios.post(
        `https://${merchant.shopDomain}/admin/api/2026-07/graphql.json`,
        { query: mutation, variables },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        },
      );
    } catch (err: any) {
      this.logger.error(
        `Shopify appSubscriptionCreate request failed for shop "${merchant.shopDomain}": ${err?.message}`,
      );
      if (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
        throw new BadRequestException(
          `Request to Shopify timed out. Is "${merchant.shopDomain}" a real, reachable Shopify store?`,
        );
      }
      throw new BadRequestException(
        `Could not reach Shopify for store "${merchant.shopDomain}": ${err?.message || 'unknown error'}`,
      );
    }

    const result = response.data?.data?.appSubscriptionCreate;
    const graphqlErrors = response.data?.errors;

    if (graphqlErrors?.length) {
      this.logger.error(`Shopify GraphQL errors: ${JSON.stringify(graphqlErrors)}`);
      throw new BadRequestException('Shopify rejected the subscription request.');
    }

    if (result?.userErrors?.length) {
      this.logger.error(`appSubscriptionCreate userErrors: ${JSON.stringify(result.userErrors)}`);
      throw new BadRequestException(
        result.userErrors.map((e: any) => e.message).join(', ') || 'Subscription request was rejected.',
      );
    }

    if (!result?.confirmationUrl) {
      this.logger.error('appSubscriptionCreate returned no confirmationUrl');
      throw new BadRequestException('Shopify did not return a checkout link. Please try again.');
    }

    // Record a pending subscription so /billing/activate has something to
    // promote to ACTIVE once the merchant approves the charge and Shopify
    // redirects back to returnUrl. Deliberately does NOT touch the
    // merchant's current ACTIVE subscription yet — cancelling it here,
    // before the merchant has even seen Shopify's approval screen, meant
    // that declining or abandoning the upgrade left the merchant with no
    // active plan at all. The old plan is only cancelled once the new one
    // is confirmed active, in activateSubscription() below.
    const pending = this.subRepo.create({
      merchantId: merchant.id,
      planId: plan.id,
      status: SubscriptionStatus.PENDING,
      shopifyChargeId: result.appSubscription?.id,
    });
    await this.subRepo.save(pending);

    return { confirmationUrl: result.confirmationUrl, plan };
  }

  /**
   * Called when the merchant lands back in our app after approving (or
   * declining) the Shopify checkout. We deliberately don't trust the
   * charge_id query param Shopify may or may not attach to the redirect —
   * that's not a documented guarantee for embedded apps. Instead we ask
   * Shopify directly what's currently active for this shop and reconcile
   * it against the PENDING row we stored when the charge was created.
   */
  async activateSubscription(merchantId: string, chargeId?: string) {
    const sub = await this.subRepo.findOne({
      where: { merchantId, status: SubscriptionStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
    if (!sub) return { success: false, reason: 'No pending subscription found' };

    const merchant = await this.merchantRepo.findOne({ where: { id: merchantId } });
    if (!merchant?.accessToken) return { success: false, reason: 'Merchant not authenticated' };

    const query = `
      query {
        currentAppInstallation {
          activeSubscriptions { id status currentPeriodEnd }
        }
      }
    `;

    let response;
    try {
      const accessToken = await this.shopifyTokenService.getValidAccessToken(merchant);
      response = await axios.post(
        `https://${merchant.shopDomain}/admin/api/2026-07/graphql.json`,
        { query },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
        },
      );
    } catch (err: any) {
      this.logger.error(`Failed to verify subscription with Shopify: ${err?.message}`);
      return { success: false, reason: 'Could not verify subscription with Shopify' };
    }

    const activeSubs = response.data?.data?.currentAppInstallation?.activeSubscriptions ?? [];
    // Only an EXACT id match counts as confirmation that Shopify approved
    // THIS specific pending request. The previous code fell back to
    // "if there's exactly one active subscription, assume it's ours" when
    // no exact match was found — but the merchant's PREVIOUS plan is often
    // still genuinely active on Shopify's side at this point (we no longer
    // cancel it until here), so that fallback was wrongly treating "the
    // old plan is still active" as "the new plan was approved," silently
    // promoting a pending request the merchant had actually declined or
    // abandoned.
    const matched = activeSubs.find((s: any) => s.id === sub.shopifyChargeId);

    if (!matched) {
      // Merchant declined the charge, abandoned it, or it's not confirmed
      // yet — leave the row as PENDING rather than guessing. The
      // merchant's previous plan (if any) is untouched and remains active.
      return { success: false, reason: 'Subscription not yet active on Shopify' };
    }

    // Now that the NEW subscription is genuinely confirmed, cancel
    // whatever the merchant was previously on — both the real Shopify
    // charge (so they're not being billed for two plans) and our local
    // record of it.
    const previousActive = await this.subRepo.findOne({
      where: { merchantId, status: SubscriptionStatus.ACTIVE },
    });
    if (previousActive && previousActive.shopifyChargeId && previousActive.shopifyChargeId !== matched.id) {
      await this.cancelShopifySubscription(merchant, previousActive.shopifyChargeId);
    }
    await this.subRepo.update(
      { merchantId, status: SubscriptionStatus.ACTIVE },
      { status: SubscriptionStatus.CANCELLED },
    );

    await this.subRepo.update(sub.id, {
      status: SubscriptionStatus.ACTIVE,
      shopifyChargeId: matched.id,
      currentPeriodStart: new Date(),
      currentPeriodEnd: matched.currentPeriodEnd ? new Date(matched.currentPeriodEnd) : null,
    });

    return { success: true };
  }

  /** Cancels a subscription on Shopify's side via appSubscriptionCancel. */
  private async cancelShopifySubscription(merchant: Merchant, shopifySubscriptionId: string): Promise<void> {
    try {
      const accessToken = await this.shopifyTokenService.getValidAccessToken(merchant);
      const mutation = `
        mutation AppSubscriptionCancel($id: ID!) {
          appSubscriptionCancel(id: $id) {
            userErrors { field message }
            appSubscription { id status }
          }
        }
      `;
      const res = await axios.post(
        `https://${merchant.shopDomain}/admin/api/2026-07/graphql.json`,
        { query: mutation, variables: { id: shopifySubscriptionId } },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        },
      );
      const errors = res.data?.data?.appSubscriptionCancel?.userErrors;
      if (errors?.length) {
        this.logger.warn(`appSubscriptionCancel userErrors for ${merchant.shopDomain}: ${JSON.stringify(errors)}`);
      }
    } catch (err: any) {
      // Non-fatal: the new subscription still activates even if cancelling
      // the old one fails here — worst case Shopify's own dashboard shows
      // two charges briefly, which the merchant or support can reconcile,
      // rather than blocking their upgrade entirely.
      this.logger.error(`Failed to cancel previous Shopify subscription for ${merchant.shopDomain}: ${err?.message}`);
    }
  }

  async activateFreePlan(merchantId: string) {
    const plan = await this.planRepo.findOne({ where: { isDefault: true } });
    if (!plan) throw new NotFoundException('Free plan not found');

    await this.subRepo.update(
      { merchantId, status: SubscriptionStatus.ACTIVE },
      { status: SubscriptionStatus.CANCELLED },
    );

    // The Free plan has no trial — it's the permanent no-cost tier, so we
    // don't stamp trialStartsAt/trialEndsAt here (those fields are only
    // meaningful for paid plans during their trial period).
    const sub = this.subRepo.create({
      merchantId,
      planId: plan.id,
      status: SubscriptionStatus.ACTIVE,
    });
    return this.subRepo.save(sub);
  }

  async cancelSubscription(merchantId: string) {
    await this.subRepo.update(
      { merchantId, status: SubscriptionStatus.ACTIVE },
      { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date() },
    );
    return { success: true };
  }
}
