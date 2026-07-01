import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { PlansSeeder } from './plans.seeder';

@Module({
  imports: [TypeOrmModule.forFeature([Plan])],
  providers: [PlansSeeder],
  exports: [PlansSeeder],
})
export class PlansModule {}
