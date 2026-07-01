import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduledTasksService } from './scheduled-tasks.service';
import { Merchant } from '../auth/entities/merchant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Merchant])],
  providers: [ScheduledTasksService],
})
export class TasksModule {}
