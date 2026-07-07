import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Merchant } from '../auth/entities/merchant.entity';
import { ShopifyTokenService } from './shopify-token.service';

@Module({
  imports: [TypeOrmModule.forFeature([Merchant])],
  providers: [ShopifyTokenService],
  exports: [ShopifyTokenService],
})
export class ShopifyTokenModule {}
