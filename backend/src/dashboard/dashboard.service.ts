import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Upload, UploadStatus } from '../uploads/entities/upload.entity';
import { UploadField } from '../uploads/entities/upload-field.entity';
import { Merchant } from '../auth/entities/merchant.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Upload) private readonly uploadRepo: Repository<Upload>,
    @InjectRepository(UploadField) private readonly fieldRepo: Repository<UploadField>,
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
  ) {}

  async getStats(merchantId: string) {
    const merchant = await this.merchantRepo.findOne({ where: { id: merchantId } });
    const today = new Date(); today.setHours(0,0,0,0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [totalUploads, uploadsToday, uploadsThisMonth, activeFields] = await Promise.all([
      this.uploadRepo.count({ where: { merchantId, deletedAt: null } }),
      this.uploadRepo.createQueryBuilder('u')
        .where('u.merchantId = :merchantId', { merchantId })
        .andWhere('u.createdAt >= :today', { today })
        .andWhere('u.deletedAt IS NULL')
        .getCount(),
      this.uploadRepo.createQueryBuilder('u')
        .where('u.merchantId = :merchantId', { merchantId })
        .andWhere('u.createdAt >= :monthStart', { monthStart })
        .andWhere('u.deletedAt IS NULL')
        .getCount(),
      this.fieldRepo.count({ where: { merchantId, isActive: true } }),
    ]);

    const ordersResult = await this.uploadRepo.createQueryBuilder('u')
      .select('COUNT(DISTINCT u.orderId)', 'count')
      .where('u.merchantId = :merchantId', { merchantId })
      .andWhere('u.orderId IS NOT NULL')
      .andWhere('u.deletedAt IS NULL')
      .getRawOne();

    return {
      totalUploads,
      uploadsToday,
      uploadsThisMonth,
      ordersWithUploads: parseInt(ordersResult?.count || '0'),
      activeFields,
      storageUsedBytes: Number(merchant?.storageUsedBytes || 0),
      storageUsedFormatted: this.formatBytes(Number(merchant?.storageUsedBytes || 0)),
    };
  }

  async getDailyUploads(merchantId: string) {
    const days = 30;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.uploadRepo.createQueryBuilder('u')
      .select('DATE(u.createdAt)', 'date')
      .addSelect('COUNT(*)', 'count')
      .where('u.merchantId = :merchantId', { merchantId })
      .andWhere('u.createdAt >= :from', { from })
      .andWhere('u.deletedAt IS NULL')
      .groupBy('DATE(u.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany();
    return rows;
  }

  async getMonthlyUploads(merchantId: string) {
    const rows = await this.uploadRepo.createQueryBuilder('u')
      .select('DATE_FORMAT(u.createdAt, "%Y-%m")', 'month')
      .addSelect('COUNT(*)', 'count')
      .where('u.merchantId = :merchantId', { merchantId })
      .andWhere('u.createdAt >= :from', { from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) })
      .andWhere('u.deletedAt IS NULL')
      .groupBy('month')
      .orderBy('month', 'ASC')
      .getRawMany();
    return rows;
  }

  async getStorageGrowth(merchantId: string) {
    const rows = await this.uploadRepo.createQueryBuilder('u')
      .select('DATE(u.createdAt)', 'date')
      .addSelect('SUM(u.fileSizeBytes)', 'bytes')
      .where('u.merchantId = :merchantId', { merchantId })
      .andWhere('u.deletedAt IS NULL')
      .groupBy('DATE(u.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany();
    return rows;
  }

  async getRecentUploads(merchantId: string) {
    return this.uploadRepo.find({
      where: { merchantId, deletedAt: null },
      order: { createdAt: 'DESC' },
      take: 10,
    });
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
  }
}
