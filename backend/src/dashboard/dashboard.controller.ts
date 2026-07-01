import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentMerchant } from '../common/decorators/current-merchant.decorator';
import { Merchant } from '../auth/entities/merchant.entity';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  getStats(@CurrentMerchant() merchant: Merchant) {
    return this.dashboardService.getStats(merchant.id);
  }

  @Get('daily-uploads')
  getDailyUploads(@CurrentMerchant() merchant: Merchant) {
    return this.dashboardService.getDailyUploads(merchant.id);
  }

  @Get('monthly-uploads')
  getMonthlyUploads(@CurrentMerchant() merchant: Merchant) {
    return this.dashboardService.getMonthlyUploads(merchant.id);
  }

  @Get('storage-growth')
  getStorageGrowth(@CurrentMerchant() merchant: Merchant) {
    return this.dashboardService.getStorageGrowth(merchant.id);
  }

  @Get('recent-uploads')
  getRecentUploads(@CurrentMerchant() merchant: Merchant) {
    return this.dashboardService.getRecentUploads(merchant.id);
  }
}
