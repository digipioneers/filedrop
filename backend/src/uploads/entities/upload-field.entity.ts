import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum FieldType {
  IMAGE = 'image',
  PDF = 'pdf',
  VIDEO = 'video',
  ZIP = 'zip',
  DOCUMENT = 'document',
  CUSTOM = 'custom',
}

export enum AssignmentType {
  PRODUCT = 'product',
  VARIANT = 'variant',
  COLLECTION = 'collection',
  TAG = 'tag',
  STORE = 'store',
}

@Entity('upload_fields')
export class UploadField {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'merchant_id' })
  merchantId: string;

  @Column({ type: 'enum', enum: FieldType, name: 'field_type', default: FieldType.IMAGE })
  fieldType: FieldType;

  @Column({ type: 'enum', enum: AssignmentType, name: 'assignment_type', default: AssignmentType.STORE })
  assignmentType: AssignmentType;

  @Column({ type: 'json', name: 'assignment_ids', nullable: true })
  assignmentIds: string[];

  @Column({ type: 'json', name: 'assigned_resource_ids', nullable: true })
  assignedResourceIds: string[];

  @Column({ type: 'json', name: 'assigned_tags', nullable: true })
  assignedTags: string[];

  @Column({ length: 255, default: 'Upload File' })
  label: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 500, nullable: true })
  placeholder: string;

  @Column({ name: 'help_text', length: 1000, nullable: true })
  helpText: string;

  @Column({ name: 'is_required', default: false })
  required: boolean;

  /** Alias for backward-compat */
  get isRequired(): boolean { return this.required; }

  @Column({ name: 'button_text', length: 100, default: 'Choose File' })
  buttonText: string;

  @Column({ name: 'max_file_size_mb', type: 'decimal', precision: 10, scale: 2, default: 10 })
  maxFileSizeMb: number;

  @Column({ name: 'min_file_size_mb', type: 'decimal', precision: 10, scale: 2, default: 0 })
  minFileSizeMb: number;

  @Column({ name: 'max_files', default: 1 })
  maxFiles: number;

  @Column({ type: 'json', name: 'allowed_extensions', nullable: true })
  allowedExtensions: string[];

  @Column({ name: 'min_width', nullable: true, type: 'int' })
  minWidth: number;

  @Column({ name: 'max_width', nullable: true, type: 'int' })
  maxWidth: number;

  @Column({ name: 'min_height', nullable: true, type: 'int' })
  minHeight: number;

  @Column({ name: 'max_height', nullable: true, type: 'int' })
  maxHeight: number;

  @Column({ name: 'required_aspect_ratio', length: 20, nullable: true })
  requiredAspectRatio: string;

  @Column({ name: 'min_resolution_dpi', nullable: true, type: 'int' })
  minResolutionDpi: number;

  @Column({ name: 'enable_cropping', default: false })
  enableCropping: boolean;

  @Column({ name: 'enable_rotation', default: false })
  enableRotation: boolean;

  /**
   * Client-requested feature: when enabled, customers see their uploaded
   * image composited onto previewTemplateUrl (a merchant-uploaded mockup,
   * e.g. a blank product photo) before finalizing their upload.
   */
  @Column({ name: 'enable_preview', default: false })
  enablePreview: boolean;

  @Column({ name: 'preview_template_url', length: 1000, nullable: true })
  previewTemplateUrl: string;

  /** Storage key for the template file — internal, never exposed to the storefront */
  @Column({ name: 'preview_template_key', length: 500, nullable: true })
  previewTemplateKey: string;

  /**
   * Where the customer's image is overlaid on the template, as percentages
   * (0-100) of the template's width/height — resolution independent.
   * Shape: { x, y, width, height }
   */
  @Column({ type: 'json', name: 'preview_placement', nullable: true })
  previewPlacement: { x: number; y: number; width: number; height: number };

  /**
   * Upgrades the static preview into an interactive designer: the customer
   * can drag/resize/rotate their image on the mockup themselves, instead of
   * the merchant fixing one placement for everyone.
   */
  @Column({ name: 'allow_customer_positioning', default: false })
  allowCustomerPositioning: boolean;

  /** Lets the customer add their own text (name, message) onto the design. */
  @Column({ name: 'allow_customer_text', default: false })
  allowCustomerText: boolean;

  @Column({ type: 'json', name: 'conditional_rules', nullable: true })
  conditionalRules: any;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
