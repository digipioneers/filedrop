import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Subscription, SubscriptionStatus } from './entities/subscription.entity';
import { Plan, PlanName } from '../plans/entities/plan.entity';
import { Merchant } from '../auth/entities/merchant.entity';
import { AppSettings } from '../admin/entities/app-settings.entity';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(AppSettings) private readonly appSettingsRepo: Repository<AppSettings>,
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
      where: { merchantId, status: SubscriptionStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
    const plan = sub
      ? await this.planRepo.findOne({ where: { id: sub.planId } })
      : await this.planRepo.findOne({ where: { name: PlanName.FREE } });
    return { subscription: sub, plan };
  }

  async createSubscription(merchant: Merchant, planName: PlanName, returnUrl: string) {
    const plan = await this.planRepo.findOne({ where: { name: planName } });
    if (!plan) throw new NotFoundException(`Plan ${planName} not found`);

    if (plan.monthlyPrice === 0) {
      return this.activateFreePlan(merchant.id);
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
    const isTestCharge = process.env.SHOPIFY_BILLING_TEST_MODE === 'true';

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
            'X-Shopify-Access-Token': merchant.accessToken,
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
    // redirects back to returnUrl.
    await this.subRepo.update(
      { merchantId: merchant.id, status: SubscriptionStatus.ACTIVE },
      { status: SubscriptionStatus.CANCELLED },
    );
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
      response = await axios.post(
        `https://${merchant.shopDomain}/admin/api/2026-07/graphql.json`,
        { query },
        {
          headers: {
            'X-Shopify-Access-Token': merchant.accessToken,
            'Content-Type': 'application/json',
          },
        },
      );
    } catch (err: any) {
      this.logger.error(`Failed to verify subscription with Shopify: ${err?.message}`);
      return { success: false, reason: 'Could not verify subscription with Shopify' };
    }

    const activeSubs = response.data?.data?.currentAppInstallation?.activeSubscriptions ?? [];
    const matched = activeSubs.find((s: any) => s.id === sub.shopifyChargeId)
      ?? (activeSubs.length === 1 ? activeSubs[0] : null);

    if (!matched) {
      // Merchant likely declined the charge — leave the row as PENDING
      // rather than guessing; a future check or webhook can clean it up.
      return { success: false, reason: 'Subscription not yet active on Shopify' };
    }

    await this.subRepo.update(sub.id, {
      status: SubscriptionStatus.ACTIVE,
      shopifyChargeId: matched.id,
      currentPeriodStart: new Date(),
      currentPeriodEnd: matched.currentPeriodEnd ? new Date(matched.currentPeriodEnd) : null,
    });

    return { success: true };
  }

  async activateFreePlan(merchantId: string) {
    const plan = await this.planRepo.findOne({ where: { name: PlanName.FREE } });
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
