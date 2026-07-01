import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

@Entity('products')
@Index(['merchantId', 'shopifyProductId'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'merchant_id' })
  merchantId: string;

  @Column({ name: 'shopify_product_id', length: 255 })
  shopifyProductId: string;

  @Column({ length: 500 })
  title: string;

  @Column({ length: 255, nullable: true })
  handle: string;

  @Column({ name: 'product_type', length: 255, nullable: true })
  productType: string;

  @Column({ type: 'json', nullable: true })
  tags: string[];

  @Column({ type: 'json', nullable: true })
  variants: ProductVariant[];

  @Column({ type: 'json', nullable: true })
  collections: ProductCollection[];

  @Column({ name: 'image_url', length: 1000, nullable: true })
  imageUrl: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

export interface ProductVariant {
  id: string;
  title: string;
  sku: string;
  price: string;
}

export interface ProductCollection {
  id: string;
  title: string;
  handle: string;
}
