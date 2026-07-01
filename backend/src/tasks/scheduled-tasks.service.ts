import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Merchant } from '../auth/entities/merchant.entity';

@Injectable()
export class ScheduledTasksService {
  private readonly logger = new Logger(ScheduledTasksService.name);

  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
  ) {}

  @Cron('0 0 1 * *', { name: 'reset-monthly-uploads', timeZone: 'UTC' })
  async resetMonthlyUploads(): Promise<void> {
    this.logger.log('Resetting monthly upload counters...');
    try {
      await this.merchantRepository
        .createQueryBuilder()
        .update(Merchant)
        .set({ monthlyUploads: 0 })
        .where('is_active = :active', { active: true })
        .execute();
      this.logger.log('Monthly upload counters reset.');
    } catch (error) {
      this.logger.error('Failed to reset monthly counters', error.stack);
    }
  }
}
