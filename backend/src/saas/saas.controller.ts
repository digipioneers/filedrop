import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentMerchant } from '../common/decorators/current-merchant.decorator';
import { Merchant } from '../auth/entities/merchant.entity';
import { SaaSService } from './saas.service';

@ApiTags('saas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('saas')
export class SaaSController {
  constructor(private readonly saasService: SaaSService) {}

  @Get('usage')
  @ApiOperation({ summary: 'Get current plan usage and limits for the merchant' })
  getUsage(@CurrentMerchant() merchant: Merchant) {
    return this.saasService.getTenantUsage(merchant.id);
  }

  @Get('trial')
  @ApiOperation({ summary: 'Get trial status and days remaining' })
  getTrialStatus(@CurrentMerchant() merchant: Merchant) {
    return this.saasService.getTrialStatus(merchant.id);
  }
}
