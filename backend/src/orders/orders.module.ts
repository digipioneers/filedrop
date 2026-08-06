import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderFilesService } from './order-files.service';
import { Upload } from '../uploads/entities/upload.entity';
import { StorageModule } from '../storage/storage.module';
import { ShopifyTokenModule } from '../shopify-token/shopify-token.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Upload]),
    StorageModule,
    ShopifyTokenModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderFilesService],
  // Exported so the webhooks module can attach uploaded files to orders.
  exports: [OrderFilesService],
})
export class OrdersModule {}
