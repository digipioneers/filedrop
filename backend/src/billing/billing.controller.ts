import {
  Controller, Get, Post, Body, Param, UseGuards, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentMerchant } from '../common/decorators/current-merchant.decorator';
import { Merchant } from '../auth/entities/merchant.entity';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Get all available plans' })
  getAllPlans() {
    return this.billingService.getAllPlans();
  }

  @Get('current')
  @ApiOperation({ summary: 'Get current subscription' })
  async getCurrentPlan(@CurrentMerchant() merchant: Merchant) {
    const result = await this.billingService.getCurrentPlan(merchant.id);
    return { ...result, isDevelopmentStore: merchant.isDevelopmentStore };
  }

  @Post('subscribe')
  @ApiOperation({ summary: 'Subscribe to a plan (planName in request body)' })
  subscribeBody(
    @CurrentMerchant() merchant: Merchant,
    @Body('planName') planName: string,
    @Body('returnUrl') returnUrl?: string,
  ) {
    const url = returnUrl || `https://${merchant.shopDomain}/admin/apps/filedrop`;
    return this.billingService.createSubscription(merchant, planName as any, url);
  }

  @Post('subscribe/:planName')
  @ApiOperation({ summary: 'Subscribe to a plan (planName in URL)' })
  subscribe(
    @CurrentMerchant() merchant: Merchant,
    @Param('planName') planName: string,
    @Query('returnUrl') returnUrl: string,
  ) {
    const url = returnUrl || `https://${merchant.shopDomain}/admin/apps/filedrop`;
    return this.billingService.createSubscription(merchant, planName as any, url);
  }

  @Get('activate')
  @ApiOperation({ summary: 'Verify and activate subscription after Shopify redirect' })
  activate(@CurrentMerchant() merchant: Merchant, @Query('charge_id') chargeId?: string) {
    return this.billingService.activateSubscription(merchant.id, chargeId);
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentMerchant() merchant: Merchant) {
    return this.billingService.cancelSubscription(merchant.id);
  }

  @Post('free')
  @HttpCode(HttpStatus.OK)
  activateFree(@CurrentMerchant() merchant: Merchant) {
    return this.billingService.activateFreePlan(merchant.id);
  }
}
