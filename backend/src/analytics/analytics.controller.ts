import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentMerchant } from '../common/decorators/current-merchant.decorator';
import { Merchant } from '../auth/entities/merchant.entity';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('daily-uploads')
  @ApiOperation({ summary: 'Daily upload counts (last N days)' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getDailyUploads(
    @CurrentMerchant() merchant: Merchant,
    @Query('days') days = 30,
  ) {
    return this.analyticsService.getDailyUploads(merchant.id, Number(days));
  }

  @Get('monthly-uploads')
  @ApiOperation({ summary: 'Monthly upload counts (last N months)' })
  @ApiQuery({ name: 'months', required: false, type: Number })
  getMonthlyUploads(
    @CurrentMerchant() merchant: Merchant,
    @Query('months') months = 12,
  ) {
    return this.analyticsService.getMonthlyUploads(merchant.id, Number(months));
  }

  @Get('storage-growth')
  @ApiOperation({ summary: 'Cumulative storage growth per day' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getStorageGrowth(
    @CurrentMerchant() merchant: Merchant,
    @Query('days') days = 30,
  ) {
    return this.analyticsService.getStorageGrowth(merchant.id, Number(days));
  }

  @Get('by-type')
  @ApiOperation({ summary: 'Upload counts by MIME type' })
  getByType(@CurrentMerchant() merchant: Merchant) {
    return this.analyticsService.getUploadsByFieldType(merchant.id);
  }

  @Get('top-fields')
  @ApiOperation({ summary: 'Most-used upload fields' })
  getTopFields(@CurrentMerchant() merchant: Merchant) {
    return this.analyticsService.getTopFields(merchant.id);
  }

  @Get('scan-stats')
  @ApiOperation({ summary: 'Virus scan status breakdown' })
  getScanStats(@CurrentMerchant() merchant: Merchant) {
    return this.analyticsService.getScanStats(merchant.id);
  }
}
