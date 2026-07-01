import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('merchant_settings')
export class MerchantSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'merchant_id', unique: true })
  merchantId: string;

  @Column({ name: 'button_color', length: 20, default: '#008060' })
  buttonColor: string;

  @Column({ name: 'button_text', length: 100, default: 'Upload File' })
  buttonText: string;

  @Column({ name: 'button_border_radius', default: 4 })
  buttonBorderRadius: number;

  @Column({ default: 'en', length: 10 })
  language: string;

  @Column({ type: 'json', name: 'custom_messages', nullable: true })
  customMessages: any;

  @Column({ name: 'notify_merchant_on_upload', default: true })
  notifyMerchantOnUpload: boolean;

  @Column({ name: 'notification_email', length: 255, nullable: true })
  notificationEmail: string;

  @Column({ name: 'notify_customer_on_upload', default: false })
  notifyCustomerOnUpload: boolean;

  @Column({ name: 'signed_url_expiry_seconds', default: 3600 })
  signedUrlExpirySeconds: number;

  @Column({ type: 'text', name: 'custom_css', nullable: true })
  customCss: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
