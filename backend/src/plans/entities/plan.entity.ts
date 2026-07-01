import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum PlanName {
  FREE = 'free',
  STARTER = 'starter',
  PRO = 'pro',
}

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: PlanName, unique: true })
  name: PlanName;

  @Column({ name: 'display_name', length: 100 })
  displayName: string;

  @Column({ name: 'monthly_price', type: 'decimal', precision: 10, scale: 2, default: 0 })
  monthlyPrice: number;

  @Column({ name: 'uploads_per_month', default: 100 })
  uploadsPerMonth: number;

  @Column({ name: 'storage_bytes', type: 'bigint' })
  storageBytes: number;

  @Column({ name: 'max_file_size_bytes', type: 'bigint' })
  maxFileSizeBytes: number;

  @Column({ type: 'json' })
  features: any;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
