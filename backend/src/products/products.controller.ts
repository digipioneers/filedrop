import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentMerchant } from '../common/decorators/current-merchant.decorator';
import { Merchant } from '../auth/entities/merchant.entity';
import { ProductsService } from './products.service';

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post('sync')
  @ApiOperation({ summary: 'Sync products from Shopify' })
  async syncProducts(@CurrentMerchant() merchant: Merchant) {
    return this.productsService.syncProducts(merchant.id);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search products by title' })
  async searchProducts(
    @CurrentMerchant() merchant: Merchant,
    @Query('q') query = '',
    @Query('limit') limit = 20,
  ) {
    return this.productsService.searchProducts(merchant.id, query, Number(limit));
  }

  @Get('collections')
  @ApiOperation({ summary: 'Get all collections from Shopify' })
  async getCollections(@CurrentMerchant() merchant: Merchant) {
    return this.productsService.getCollections(merchant.id);
  }
}
