import { Controller, Get, Patch, Param, Query, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentMerchant } from '../common/decorators/current-merchant.decorator';
import { Merchant } from '../auth/entities/merchant.entity';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications for merchant' })
  getNotifications(
    @CurrentMerchant() merchant: Merchant,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notificationsService.getForMerchant(
      merchant.id,
      Number(page),
      Number(limit),
      unreadOnly === 'true',
    );
  }

  @Patch(':id/read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markRead(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') id: string,
  ) {
    await this.notificationsService.markRead(merchant.id, id);
  }

  @Patch('read-all')
  @HttpCode(204)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllRead(@CurrentMerchant() merchant: Merchant) {
    await this.notificationsService.markAllRead(merchant.id);
  }
}
