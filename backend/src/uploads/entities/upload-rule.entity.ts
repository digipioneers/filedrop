import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum RuleCondition {
  PRODUCT_TAG = 'product_tag',
  VARIANT_TITLE = 'variant_title',
  PRODUCT_ID = 'product_id',
  COLLECTION_ID = 'collection_id',
  CUSTOMER_TAG = 'customer_tag',
}

export enum RuleOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
}

export enum RuleAction {
  SHOW = 'show',
  HIDE = 'hide',
  REQUIRE = 'require',
}

@Entity('upload_rules')
export class UploadRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'upload_field_id' })
  uploadFieldId: string;

  @Column({ name: 'merchant_id' })
  merchantId: string;

  @Column({ type: 'enum', enum: RuleCondition })
  condition: RuleCondition;

  @Column({ type: 'enum', enum: RuleOperator, default: RuleOperator.EQUALS })
  operator: RuleOperator;

  @Column({ length: 500 })
  value: string;

  @Column({ type: 'enum', enum: RuleAction, default: RuleAction.SHOW })
  action: RuleAction;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
