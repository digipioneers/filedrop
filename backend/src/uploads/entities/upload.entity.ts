import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum UploadStatus {
  PENDING = 'pending',
  SCANNING = 'scanning',
  CLEAN = 'clean',
  INFECTED = 'infected',
  FAILED = 'failed',
}

@Entity('uploads')
export class Upload {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'merchant_id' })
  merchantId: string;

  @Column({ name: 'upload_field_id', nullable: true })
  uploadFieldId: string;

  @Column({ name: 'original_file_name', length: 500 })
  originalFileName: string;

  @Column({ name: 'sanitized_file_name', length: 500 })
  sanitizedFileName: string;

  @Column({ name: 's3_key', length: 1000 })
  s3Key: string;

  @Column({ name: 's3_bucket', length: 255 })
  s3Bucket: string;

  @Column({ name: 'mime_type', length: 255 })
  mimeType: string;

  @Column({ name: 'file_extension', length: 50 })
  fileExtension: string;

  @Column({ name: 'file_size_bytes', type: 'bigint' })
  fileSizeBytes: number;

  @Column({ name: 'image_width', nullable: true, type: 'int' })
  imageWidth: number;

  @Column({ name: 'image_height', nullable: true, type: 'int' })
  imageHeight: number;

  @Column({ type: 'enum', enum: UploadStatus, default: UploadStatus.PENDING })
  status: UploadStatus;

  @Column({ name: 'scan_result', length: 500, nullable: true })
  scanResult: string;

  @Column({ name: 'cart_token', length: 500, nullable: true })
  cartToken: string;

  @Column({ name: 'order_id', length: 255, nullable: true })
  orderId: string;

  @Column({ name: 'shopify_order_id', length: 255, nullable: true })
  shopifyOrderId: string;

  @Column({ name: 'line_item_id', length: 255, nullable: true })
  lineItemId: string;

  @Column({ name: 'product_id', length: 255, nullable: true })
  productId: string;

  @Column({ name: 'variant_id', length: 255, nullable: true })
  variantId: string;

  @Column({ name: 'customer_email', length: 255, nullable: true })
  customerEmail: string;

  @Column({ name: 'customer_id', length: 255, nullable: true })
  customerId: string;

  @Column({ name: 'download_count', default: 0 })
  downloadCount: number;

  @Column({ name: 'scanned_at', nullable: true, type: 'datetime' })
  scannedAt: Date;

  @Column({ name: 'deleted_at', nullable: true, type: 'datetime' })
  deletedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
