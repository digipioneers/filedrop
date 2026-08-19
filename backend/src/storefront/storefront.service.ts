import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { Upload, UploadStatus } from '../uploads/entities/upload.entity';
import { UploadField, AssignmentType } from '../uploads/entities/upload-field.entity';
import { Merchant } from '../auth/entities/merchant.entity';
import { MerchantSettings } from '../settings/entities/merchant-settings.entity';
import { Plan, PlanName } from '../plans/entities/plan.entity';
import { Subscription, SubscriptionStatus } from '../billing/entities/subscription.entity';
import { StorageService } from '../storage/storage.service';
import { SecurityService } from '../security/security.service';
import { EmailService } from '../email/email.service';
import { AppSettings } from '../admin/entities/app-settings.entity';
import { Product } from '../products/entities/product.entity';
import { v4 as uuid } from 'uuid';
import { getImageDimensions } from '../common/utils/image-dimensions';
import { buildDownloadFilename } from '../common/utils/download-filename.util';
import { makeDownloadToken } from '../uploads/download-token.util';

@Injectable()
export class StorefrontService {
  private readonly logger = new Logger(StorefrontService.name);

  constructor(
    @InjectRepository(Upload) private readonly uploadRepo: Repository<Upload>,
    @InjectRepository(UploadField) private readonly fieldRepo: Repository<UploadField>,
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(MerchantSettings) private readonly settingsRepo: Repository<MerchantSettings>,
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(AppSettings) private readonly appSettingsRepo: Repository<AppSettings>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    private readonly storageService: StorageService,
    private readonly securityService: SecurityService,
    private readonly emailService: EmailService,
  ) {}

  async resolveMerchantId(shopDomainOrMerchantId: string): Promise<string> {
    // Callers may pass either the Shopify shop domain (from the widget) or
    // an actual merchant UUID (from internal/back-office calls). Try shop
    // domain first since that's what the storefront widget sends.
    const byShop = await this.merchantRepo.findOne({
      where: { shopDomain: shopDomainOrMerchantId, isActive: true },
    });
    if (byShop) return byShop.id;
    return shopDomainOrMerchantId;
  }

  async getFieldsForProduct(shopOrMerchantId: string, productId?: string, variantId?: string, tags: string[] = []) {
    const merchantId = await this.resolveMerchantId(shopOrMerchantId);
    const merchant = await this.merchantRepo.findOne({ where: { id: merchantId, isActive: true } });
    if (!merchant) throw new NotFoundException('Store not found');

    const fields = await this.fieldRepo.find({
      where: { merchantId, isActive: true },
      order: { sortOrder: 'ASC' },
    });

    // The widget only sends productId + variantId, so derive the product's
    // collections and tags from our cached catalogue. This is what makes
    // COLLECTION and TAG assignment actually work on the storefront.
    let productCollectionIds: string[] = [];
    let productTags: string[] = Array.isArray(tags) ? [...tags] : [];
    if (productId) {
      const product = await this.productRepo.findOne({
        where: { merchantId, shopifyProductId: String(productId) },
      });
      if (product) {
        productCollectionIds = (Array.isArray(product.collections) ? product.collections : [])
          .map((c: any) => String(c.id));
        if (Array.isArray(product.tags)) {
          productTags = [...new Set([...productTags, ...product.tags])];
        }
      }
    }

    // The admin picker saves selections to `assignedResourceIds` (products /
    // variants / collections) and `assignedTags`. Older data may still live in
    // the legacy `assignmentIds` column, so fall back to it. Reading the wrong
    // column here was why assigned fields never appeared on the storefront.
    const resourceIds = (f: UploadField): string[] =>
      f.assignedResourceIds && f.assignedResourceIds.length
        ? f.assignedResourceIds
        : f.assignmentIds || [];
    const tagIds = (f: UploadField): string[] =>
      f.assignedTags && f.assignedTags.length ? f.assignedTags : f.assignmentIds || [];

    return fields
      .filter(field => {
        switch (field.assignmentType) {
          case AssignmentType.STORE:
            return true;
          case AssignmentType.PRODUCT:
            return !!productId && resourceIds(field).includes(String(productId));
          case AssignmentType.VARIANT:
            return !!variantId && resourceIds(field).includes(String(variantId));
          case AssignmentType.COLLECTION:
            return productCollectionIds.some(c => resourceIds(field).includes(c));
          case AssignmentType.TAG:
            return productTags.some(t => tagIds(field).includes(t));
          default:
            return false;
        }
      })
      .map(f => ({
        id: f.id,
        label: f.label,
        description: f.description,
        helpText: f.helpText,
        buttonText: f.buttonText,
        isRequired: f.required,
        maxFileSizeMb: f.maxFileSizeMb,
        minFileSizeMb: f.minFileSizeMb,
        maxFiles: f.maxFiles,
        allowedExtensions: f.allowedExtensions,
        fieldType: f.fieldType,
        enableCropping: f.enableCropping,
        enableRotation: f.enableRotation,
        enablePreview: f.enablePreview,
        previewTemplateUrl: f.enablePreview ? f.previewTemplateUrl : null,
        previewPlacement: f.enablePreview ? f.previewPlacement : null,
        allowCustomerPositioning: f.enablePreview ? f.allowCustomerPositioning : false,
        allowCustomerText: f.enablePreview ? f.allowCustomerText : false,
        minWidth: f.minWidth,
        maxWidth: f.maxWidth,
        minHeight: f.minHeight,
        maxHeight: f.maxHeight,
        requiredAspectRatio: f.requiredAspectRatio,
      }));
  }

  /**
   * Fetches the raw bytes for a field's preview-template mockup image, for
   * the public proxy route. Not scoped to a merchant since fieldId alone
   * is enough — this is a non-sensitive template photo.
   */
  async getPreviewTemplateFile(fieldId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const field = await this.fieldRepo.findOne({ where: { id: fieldId } });
    if (!field || !field.enablePreview || !field.previewTemplateKey) {
      throw new NotFoundException('Preview template not found');
    }
    let buffer: Buffer;
    try {
      buffer = await this.storageService.getFileBuffer(field.previewTemplateKey);
    } catch (err: any) {
      // Most likely cause: the object was deleted directly from the storage
      // bucket (e.g. manual cleanup) while this field's DB record still
      // references its key. Surface a clean 404 instead of letting the raw
      // S3 NoSuchKey error bubble up as an unhandled 500.
      this.logger.warn(
        `Preview template file missing for field ${fieldId} (key: ${field.previewTemplateKey}): ${err?.message}`,
      );
      throw new NotFoundException('Preview template file is missing — please re-upload it in Upload Field settings');
    }
    const ext = field.previewTemplateKey.split('.').pop() || 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return { buffer, mimeType };
  }

  /**
   * Resolve a short-lived storage URL for a customer upload, used by the public
   * token-authed preview/download route. Token verification happens in the
   * controller; by the time we're here the request is already authorized.
   */
  async getPublicFileUrl(
    uploadId: string,
    forceDownload: boolean,
  ): Promise<{ url: string }> {
    const upload = await this.uploadRepo.findOne({ where: { id: uploadId } });
    if (!upload) throw new NotFoundException('Upload not found');
    if (upload.status === UploadStatus.INFECTED) {
      throw new ForbiddenException('File is not available');
    }

    // Presign for a short window purely to redirect the browser to storage.
    // The permanence lives in the token on our own URL, not in this one.
    const filename = buildDownloadFilename(upload);
    const url = await this.storageService.getSignedDownloadUrl(
      upload.s3Key,
      forceDownload ? filename : undefined,
      300,
    );
    return { url };
  }

  async getPublicSettings(shopOrMerchantId: string) {
    const merchantId = await this.resolveMerchantId(shopOrMerchantId);
    const s = await this.settingsRepo.findOne({ where: { merchantId } });
    return {
      buttonColor: s?.buttonColor || '#008060',
      buttonText: s?.buttonText || 'Upload File',
      buttonBorderRadius: s?.buttonBorderRadius || 4,
      language: s?.language || 'en',
      customMessages: s?.customMessages || {},
      customCss: s?.customCss || '',
    };
  }

  async handleCustomerUpload(opts: {
    merchantId: string; fieldId: string; file: any;
    cartToken?: string; productId?: string; variantId?: string; customerEmail?: string;
  }) {
    const appSettings = await this.appSettingsRepo.findOne({ where: {} });
    if (appSettings?.maintenanceMode) {
      throw new ForbiddenException('Uploads are temporarily disabled for maintenance. Please try again shortly.');
    }

    const merchantId = await this.resolveMerchantId(opts.merchantId);
    const { fieldId, file } = opts;

    const merchant = await this.merchantRepo.findOne({ where: { id: merchantId, isActive: true } });
    if (!merchant) throw new NotFoundException('Store not found');

    const field = await this.fieldRepo.findOne({ where: { id: fieldId, merchantId, isActive: true } });
    if (!field) throw new NotFoundException('Upload field not found');

    await this.checkPlanLimits(merchant);

    const { valid: mimeOk } = this.securityService.validateMimeType(file.buffer, field.fieldType);
    if (!mimeOk) throw new BadRequestException('File type not allowed');

    const extOk = this.securityService.validateExtension(file.originalname);
    if (!extOk) throw new BadRequestException('File extension not permitted');

    this.securityService.validateFileSize(file.size, Number(field.maxFileSizeMb), Number(field.minFileSizeMb));

    let imageWidth: number = null;
    let imageHeight: number = null;
    if (file.mimetype.startsWith('image/')) {
      const dims = getImageDimensions(file.buffer);
      // Only enforce dimension rules when the dimensions were actually parsed.
      // Otherwise imageWidth/imageHeight stay null, and `null < field.minWidth`
      // coerces to `0 < minWidth` === true, wrongly rejecting a valid file with
      // a misleading "Min width" error.
      if (dims) {
        imageWidth = dims.width;
        imageHeight = dims.height;
        if (field.minWidth && imageWidth < field.minWidth) throw new BadRequestException(`Min width: ${field.minWidth}px`);
        if (field.maxWidth && imageWidth > field.maxWidth) throw new BadRequestException(`Max width: ${field.maxWidth}px`);
        if (field.minHeight && imageHeight < field.minHeight) throw new BadRequestException(`Min height: ${field.minHeight}px`);
        if (field.maxHeight && imageHeight > field.maxHeight) throw new BadRequestException(`Max height: ${field.maxHeight}px`);
      }
    }

    const sanitized = this.securityService.sanitizeFileName(file.originalname);
    const ext = sanitized.split('.').pop()?.toLowerCase() || '';
    const fileId = uuid();
    const s3Key = `${merchantId}/${opts.cartToken ? 'cart_' + opts.cartToken : 'upload_' + fileId}/uploaded_files/${fileId}.${ext}`;

    await this.storageService.uploadFile(s3Key, file.buffer, file.mimetype);

    const upload = this.uploadRepo.create({
      merchantId,
      uploadFieldId: fieldId,
      originalFileName: file.originalname,
      sanitizedFileName: sanitized,
      s3Key,
      s3Bucket: process.env.MINIO_BUCKET || process.env.R2_BUCKET || process.env.AWS_S3_BUCKET || 'cfup-uploads',
      mimeType: file.mimetype,
      fileExtension: ext,
      fileSizeBytes: file.size,
      imageWidth,
      imageHeight,
      status: UploadStatus.PENDING,
      cartToken: opts.cartToken,
      productId: opts.productId,
      variantId: opts.variantId,
      customerEmail: opts.customerEmail,
    });
    await this.uploadRepo.save(upload);

    await this.merchantRepo.increment({ id: merchantId }, 'totalUploads', 1);
    await this.merchantRepo.increment({ id: merchantId }, 'monthlyUploads', 1);
    await this.merchantRepo.increment({ id: merchantId }, 'storageUsedBytes', file.size);

    this.virusScanAsync(upload, merchant).catch(e => this.logger.error(e.message));

    const publicBase = (process.env.APP_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
    const token = makeDownloadToken(upload.id);
    const previewUrl = `${publicBase}/api/v1/storefront/file/${upload.id}?token=${token}`;
    const downloadUrl = `${previewUrl}&download=1`;

    return {
      uploadId: upload.id,
      id: upload.id,
      fileName: sanitized,
      fileSize: file.size,
      status: 'pending',
      // Public, permanent, token-authed URLs. The widget writes previewUrl into
      // a Shopify line-item property so it shows under the product on the order.
      previewUrl,
      downloadUrl,
      isImage: (upload.mimeType || '').startsWith('image/'),
    };
  }

  private async virusScanAsync(upload: Upload, merchant: Merchant) {
    await this.uploadRepo.update(upload.id, { status: UploadStatus.SCANNING });
    let buffer: Buffer;
    try {
      buffer = await this.storageService.getFileBuffer(upload.s3Key);
    } catch (err: any) {
      // Without this catch, any failure here (missing object, transient S3
      // error, etc.) leaves the upload stuck showing "scanning" forever,
      // since the outer .catch() in the caller only logs — it never updates
      // the upload's status to a terminal state.
      this.logger.error(`Virus scan could not read file for upload ${upload.id}: ${err?.message}`);
      await this.uploadRepo.update(upload.id, {
        status: UploadStatus.FAILED,
        scanResult: 'File could not be read for scanning',
      });
      return;
    }
    const { isClean, virusName } = await this.securityService.scanForViruses(buffer);

    if (isClean) {
      await this.uploadRepo.update(upload.id, { status: UploadStatus.CLEAN, scanResult: 'clean' });
      const settings = await this.settingsRepo.findOne({ where: { merchantId: merchant.id } });
      if (settings?.notifyMerchantOnUpload) {
        const url = await this.storageService.getSignedDownloadUrl(upload.s3Key, buildDownloadFilename(upload));
        await this.emailService.sendMerchantUploadNotification({
          merchantEmail: settings.notificationEmail || merchant.shopEmail,
          shopName: merchant.shopName || merchant.shopDomain,
          fileName: upload.originalFileName,
          fileSize: `${(upload.fileSizeBytes / 1024 / 1024).toFixed(2)} MB`,
          orderId: upload.shopifyOrderId,
          customerEmail: upload.customerEmail,
          downloadUrl: url,
        });
      }
    } else {
      await this.uploadRepo.update(upload.id, { status: UploadStatus.INFECTED, scanResult: virusName });
    }
  }

  async removeCustomerUpload(uploadId: string, shopOrMerchantId: string, cartToken: string) {
    const merchantId = await this.resolveMerchantId(shopOrMerchantId);
    const upload = await this.uploadRepo.findOne({ where: { id: uploadId, merchantId, cartToken, deletedAt: null } });
    if (!upload) throw new NotFoundException('Upload not found');
    if (upload.orderId) throw new ForbiddenException('Cannot remove after order placed');
    // Soft-delete the DB record regardless of whether the storage delete
    // succeeds — a missing object shouldn't block the customer from
    // removing an upload from their cart (e.g. it was already cleaned up
    // manually), and this stays consistent with the other delete call
    // sites in the codebase which already tolerate this.
    await this.storageService.deleteFile(upload.s3Key).catch((err: any) => {
      this.logger.warn(`Could not delete storage object for upload ${uploadId}: ${err?.message}`);
    });
    await this.uploadRepo.update(uploadId, { deletedAt: new Date() });
  }

  /**
   * Re-binds one or more uploads to the cart's final, durable token, called
   * by the widget right after it detects a successful Add to Cart. See the
   * controller's doc comment for why this is necessary.
   *
   * Scoped defensively: only touches uploads that (a) belong to this
   * merchant, (b) haven't already been linked to an order, and (c) — when
   * oldCartToken is provided — currently carry that specific provisional
   * token, so this can never accidentally reassign someone else's upload.
   */
  async rebindCartToken(
    shopOrMerchantId: string,
    uploadIds: string[],
    oldCartToken: string | undefined,
    newCartToken: string,
  ): Promise<{ updated: number }> {
    const merchantId = await this.resolveMerchantId(shopOrMerchantId);

    const where: any = {
      id: In(uploadIds),
      merchantId,
      orderId: IsNull(),
      deletedAt: IsNull(),
    };
    if (oldCartToken) where.cartToken = oldCartToken;

    const result = await this.uploadRepo.update(where, { cartToken: newCartToken });
    const updated = result.affected || 0;
    this.logger.log(
      `Rebound ${updated} upload(s) from cartToken "${oldCartToken}" to "${newCartToken}" for merchant ${merchantId}`,
    );
    return { updated };
  }

  private async checkPlanLimits(merchant: Merchant) {
    // Match ACTIVE *and* TRIAL subscriptions — a merchant on a trial should get
    // their trial plan's limits, not silently fall back to the Free plan.
    const sub = await this.subRepo.findOne({
      where: [
        { merchantId: merchant.id, status: SubscriptionStatus.ACTIVE },
        { merchantId: merchant.id, status: SubscriptionStatus.TRIAL },
      ],
      order: { createdAt: 'DESC' },
    });
    const plan = sub
      ? await this.planRepo.findOne({ where: { id: sub.planId } })
      : await this.planRepo.findOne({ where: { name: PlanName.FREE } });
    if (!plan) return;
    // These are shown directly to the SHOPPER on the storefront (not the
    // merchant), so they deliberately don't mention plan names or specific
    // limit numbers — that's internal merchant billing detail a customer
    // has no reason to see. The technical detail is still logged for the
    // merchant/support to diagnose from server logs if needed.
    if (plan.uploadsPerMonth !== -1 && merchant.monthlyUploads >= plan.uploadsPerMonth) {
      this.logger.warn(
        `Upload blocked for merchant ${merchant.id}: monthly limit of ${plan.uploadsPerMonth} reached (plan: ${plan.displayName})`,
      );
      throw new ForbiddenException('This store is not accepting new uploads right now. Please try again later.');
    }
    if (Number(plan.storageBytes) !== -1 && Number(merchant.storageUsedBytes) >= Number(plan.storageBytes)) {
      this.logger.warn(`Upload blocked for merchant ${merchant.id}: storage limit reached (plan: ${plan.displayName})`);
      throw new ForbiddenException('This store is not accepting new uploads right now. Please try again later.');
    }
  }
}
