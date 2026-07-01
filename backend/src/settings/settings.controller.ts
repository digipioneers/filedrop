import { Controller, Get, Patch, Put, Body, UseGuards, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService, UpdateSettingsDto } from './settings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentMerchant } from '../common/decorators/current-merchant.decorator';
import { Merchant } from '../auth/entities/merchant.entity';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'Get merchant settings' })
  getSettings(@CurrentMerchant() merchant: Merchant) {
    return this.settingsService.getSettings(merchant.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch()
  @ApiOperation({ summary: 'Update merchant settings' })
  updateSettings(@CurrentMerchant() merchant: Merchant, @Body() dto: UpdateSettingsDto) {
    return this.settingsService.updateSettings(merchant.id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Put()
  @ApiOperation({ summary: 'Update merchant settings (alias for PATCH, used by admin UI)' })
  updateSettingsPut(@CurrentMerchant() merchant: Merchant, @Body() dto: UpdateSettingsDto) {
    return this.settingsService.updateSettings(merchant.id, dto);
  }

  @Get('public/:merchantId')
  @ApiOperation({ summary: 'Get public storefront settings' })
  getPublicSettings(@Param('merchantId') merchantId: string) {
    return this.settingsService.getPublicSettings(merchantId);
  }
}
