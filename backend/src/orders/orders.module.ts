import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Upload } from '../uploads/entities/upload.entity';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([Upload]), StorageModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
