import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Merchant } from '../auth/entities/merchant.entity';
import { Upload } from '../uploads/entities/upload.entity';
import { UploadField } from '../uploads/entities/upload-field.entity';
import { MerchantSettings } from '../settings/entities/merchant-settings.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { Product } from '../products/entities/product.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { StorageService } from '../storage/storage.service';

/**
 * Single source of truth for permanently removing EVERYTHING we hold for a
 * merchant — the actual files in object storage plus every database row keyed
 * to that merchant. Used by both the app/uninstalled webhook (so a reinstall
 * starts completely fresh) and the GDPR shop/redact webhook.
 *
 * There are no FK cascades in the schema, so every table has to be cleared
 * explicitly or it would be left orphaned.
 */
@Injectable()
export class MerchantCleanupService {
  private readonly logger = new Logger(MerchantCleanupService.name);

  constructor(
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(Upload) private readonly uploadRepo: Repository<Upload>,
    @InjectRepository(UploadField) private readonly fieldRepo: Repository<UploadField>,
    @InjectRepository(MerchantSettings) private readonly settingsRepo: Repository<MerchantSettings>,
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(Notification) private readonly notificationRepo: Repository<Notification>,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Permanently delete all files and all database rows for a shop.
   * Safe to call when the merchant no longer exists (returns quietly).
   */
  async purgeMerchantData(shopDomain: string): Promise<{ deletedFiles: number } | null> {
    const merchant = await this.merchantRepo.findOne({ where: { shopDomain } });
    if (!merchant) {
      this.logger.log(`purgeMerchantData: no merchant for ${shopDomain} (already purged).`);
      return null;
    }

    // 1) Delete every stored file: customer uploads + merchant preview templates.
    const uploads = await this.uploadRepo.find({ where: { merchantId: merchant.id } });
    let deletedFiles = 0;
    for (const u of uploads) {
      if (u.s3Key) {
        await this.storageService
          .deleteFile(u.s3Key)
          .then(() => {
            deletedFiles++;
          })
          .catch((e: any) =>
            this.logger.warn(`purge: could not delete file ${u.s3Key}: ${e?.message}`),
          );
      }
    }

    const fields = await this.fieldRepo.find({ where: { merchantId: merchant.id } });
    for (const f of fields) {
      if (f.previewTemplateKey) {
        await this.storageService
          .deleteFile(f.previewTemplateKey)
          .catch((e: any) =>
            this.logger.warn(`purge: could not delete template ${f.previewTemplateKey}: ${e?.message}`),
          );
      }
    }

    // 2) Delete every DB row for this merchant (no cascades exist).
    await this.uploadRepo.delete({ merchantId: merchant.id });
    await this.fieldRepo.delete({ merchantId: merchant.id });
    await this.productRepo.delete({ merchantId: merchant.id });
    await this.notificationRepo.delete({ merchantId: merchant.id });
    await this.settingsRepo.delete({ merchantId: merchant.id });
    await this.subRepo.delete({ merchantId: merchant.id });
    await this.merchantRepo.delete({ id: merchant.id });

    this.logger.log(
      `purgeMerchantData: removed ${deletedFiles} file(s) and all data for ${shopDomain}.`,
    );
    return { deletedFiles };
  }
}
