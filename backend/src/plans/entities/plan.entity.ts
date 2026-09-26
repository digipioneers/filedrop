import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum PlanName {
  FREE = 'free',       // displayed to merchants as "Development"
  STARTER = 'starter', // displayed to merchants as "Basic"
  PRO = 'pro',
  ADVANCED = 'advanced',
}

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Stored as a free-text handle (no longer a fixed enum) so new plans can be
  // added from the super-admin. Existing plans keep their handle ('free', etc.).
  @Column({ length: 50, unique: true })
  name: string;

  @Column({ name: 'display_name', length: 100 })
  displayName: string;

  // Same TypeORM decimal-as-string quirk as UploadField's file-size columns —
  // without this transformer, monthlyPrice comes back as a string like "7.99"
  // instead of a number, which breaks any numeric comparison/math downstream.
  @Column({
    name: 'monthly_price', type: 'decimal', precision: 10, scale: 2, default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => (v === null ? null : parseFloat(v)) },
  })
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

  // Marks the default/free plan assigned on install and used as the fallback
  // when a merchant has no active paid subscription. Exactly one plan should
  // have this set. The default plan cannot be deleted from the admin.
  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
