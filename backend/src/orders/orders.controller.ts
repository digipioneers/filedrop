import {
  Controller, Get, Param, Query, UseGuards,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentMerchant } from '../common/decorators/current-merchant.decorator';
import { Merchant } from '../auth/entities/merchant.entity';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List all orders with uploads' })
  getMerchantOrders(
    @CurrentMerchant() merchant: Merchant,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.ordersService.getMerchantOrders(merchant.id, page, limit);
  }

  @Get(':orderId/uploads')
  @ApiOperation({ summary: 'Get all uploads for an order' })
  getOrderUploads(
    @CurrentMerchant() merchant: Merchant,
    @Param('orderId') orderId: string,
  ) {
    return this.ordersService.getOrderUploads(merchant.id, orderId);
  }

  @Get(':orderId/download-all')
  @ApiOperation({ summary: 'Get signed download URLs for all files in an order' })
  downloadAll(
    @CurrentMerchant() merchant: Merchant,
    @Param('orderId') orderId: string,
  ) {
    return this.ordersService.downloadAllForOrder(merchant.id, orderId);
  }
}
