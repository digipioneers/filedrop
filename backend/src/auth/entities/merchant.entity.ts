import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('merchants')
export class Merchant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'shop_domain', unique: true, length: 255 })
  shopDomain: string;

  @Column({ name: 'access_token', length: 500 })
  accessToken: string;

  @Column({ name: 'refresh_token', length: 500, nullable: true })
  refreshToken: string;

  @Column({ name: 'token_expires_at', type: 'datetime', nullable: true })
  tokenExpiresAt: Date;

  @Column({ name: 'shop_name', nullable: true, length: 255 })
  shopName: string;

  @Column({ name: 'shop_email', nullable: true, length: 255 })
  shopEmail: string;

  @Column({ name: 'shop_currency', nullable: true, default: 'USD', length: 10 })
  shopCurrency: string;

  @Column({ name: 'shop_timezone', nullable: true, default: 'UTC', length: 100 })
  shopTimezone: string;

  @Column({ default: 'en', length: 10 })
  language: string;

  @Column({ name: 'storage_used_bytes', type: 'bigint', default: 0 })
  storageUsedBytes: number;

  @Column({ name: 'total_uploads', default: 0 })
  totalUploads: number;

  @Column({ name: 'monthly_uploads', default: 0 })
  monthlyUploads: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'uninstalled_at', nullable: true, type: 'datetime' })
  uninstalledAt: Date;

  @CreateDateColumn({ name: 'installed_at' })
  installedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
