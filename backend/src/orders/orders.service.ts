import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Upload, UploadStatus } from '../uploads/entities/upload.entity';
import { StorageService } from '../storage/storage.service';
import { buildDownloadFilename } from '../common/utils/download-filename.util';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Upload)
    private readonly uploadRepository: Repository<Upload>,
    private readonly storageService: StorageService,
  ) {}

  async getOrderUploads(merchantId: string, orderId: string) {
    const uploads = await this.uploadRepository.find({
      where: { merchantId, orderId, deletedAt: null },
      order: { createdAt: 'DESC' },
    });
    if (!uploads.length) throw new NotFoundException(`No uploads found for order ${orderId}`);

    const uploadsWithUrls = await Promise.all(
      uploads.map(async (upload) => {
        const signedUrl = upload.status === UploadStatus.CLEAN
          ? await this.storageService.getSignedDownloadUrl(upload.s3Key, buildDownloadFilename(upload), 3600)
          : null;
        return { ...upload, signedUrl };
      }),
    );

    return {
      orderId,
      shopifyOrderId: uploads[0]?.shopifyOrderId,
      totalFiles: uploads.length,
      totalSizeBytes: uploads.reduce((sum, u) => sum + Number(u.fileSizeBytes || 0), 0),
      uploads: uploadsWithUrls,
    };
  }

  async getMerchantOrders(merchantId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const result = await this.uploadRepository
      .createQueryBuilder('upload')
      .select('upload.orderId', 'orderId')
      .addSelect('upload.shopifyOrderId', 'shopifyOrderId')
      .addSelect('COUNT(upload.id)', 'fileCount')
      .addSelect('SUM(upload.fileSizeBytes)', 'totalSizeBytes')
      .addSelect('MAX(upload.createdAt)', 'lastUploadAt')
      .where('upload.merchantId = :merchantId', { merchantId })
      .andWhere('upload.orderId IS NOT NULL')
      .andWhere('upload.deletedAt IS NULL')
      .groupBy('upload.orderId')
      .addGroupBy('upload.shopifyOrderId')
      .orderBy('MAX(upload.createdAt)', 'DESC')
      .offset(skip)
      .limit(limit)
      .getRawMany();

    const totalResult = await this.uploadRepository
      .createQueryBuilder('upload')
      .select('COUNT(DISTINCT upload.orderId)', 'count')
      .where('upload.merchantId = :merchantId', { merchantId })
      .andWhere('upload.orderId IS NOT NULL')
      .andWhere('upload.deletedAt IS NULL')
      .getRawOne();

    return {
      orders: result,
      total: parseInt(totalResult?.count || '0', 10),
      page,
      limit,
    };
  }

  async downloadAllForOrder(merchantId: string, orderId: string) {
    const uploads = await this.uploadRepository.find({
      where: { merchantId, orderId, deletedAt: null },
    });
    return Promise.all(
      uploads.map(async (upload) => {
        const fileName = buildDownloadFilename(upload);
        return {
          fileName,
          url: await this.storageService.getSignedDownloadUrl(upload.s3Key, fileName, 900),
        };
      }),
    );
  }
}
