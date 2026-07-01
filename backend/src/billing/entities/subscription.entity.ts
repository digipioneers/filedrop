import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum SubscriptionStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  TRIAL = 'trial',
}

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'merchant_id' })
  merchantId: string;

  @Column({ name: 'plan_id' })
  planId: string;

  @Column({ type: 'enum', enum: SubscriptionStatus, default: SubscriptionStatus.TRIAL })
  status: SubscriptionStatus;

  @Column({ name: 'shopify_charge_id', length: 255, nullable: true })
  shopifyChargeId: string;

  @Column({ name: 'shopify_charge_status', length: 100, nullable: true })
  shopifyChargeStatus: string;

  @Column({ name: 'trial_starts_at', nullable: true, type: 'datetime' })
  trialStartsAt: Date;

  @Column({ name: 'trial_ends_at', nullable: true, type: 'datetime' })
  trialEndsAt: Date;

  @Column({ name: 'current_period_start', nullable: true, type: 'datetime' })
  currentPeriodStart: Date;

  @Column({ name: 'current_period_end', nullable: true, type: 'datetime' })
  currentPeriodEnd: Date;

  @Column({ name: 'cancel_at_period_end', default: false })
  cancelAtPeriodEnd: boolean;

  @Column({ name: 'cancelled_at', nullable: true, type: 'datetime' })
  cancelledAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
