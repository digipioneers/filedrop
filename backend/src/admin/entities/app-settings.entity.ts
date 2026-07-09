import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * Global, platform-wide configuration (super-admin "App Settings" screen).
 * This is a singleton table — exactly one row is expected to exist.
 * Use AppSettingsService.get()/update() rather than the repository directly
 * so the singleton invariant and defaults stay in one place.
 */
@Entity('app_settings')
export class AppSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'app_name', length: 255, default: 'Filedrop' })
  appName: string;

  @Column({ name: 'support_email', length: 255, default: 'support@yourapp.com' })
  supportEmail: string;

  @Column({ name: 'max_free_storage_gb', default: 1 })
  maxFreeStorageGb: number;

  @Column({ name: 'default_trial_days', default: 14 })
  defaultTrialDays: number;

  @Column({ name: 'maintenance_mode', default: false })
  maintenanceMode: boolean;

  @Column({ name: 'allow_new_registrations', default: true })
  allowNewRegistrations: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
