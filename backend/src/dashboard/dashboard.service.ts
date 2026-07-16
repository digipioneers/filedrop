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

    // Total Uploads and This Month now read from the SAME cumulative
    // merchant.totalUploads / merchant.monthlyUploads counters that
    // billing.service.ts and the plan-limit check already use as the
    // real source of truth. Previously these were computed as a live
    // COUNT(*) against current uploads rows, which silently diverged from
    // the Billing page's numbers whenever any upload got deleted (manual
    // cleanup, a customer removing their own upload, scheduled retention,
    // etc.) — the count would go down, but the cumulative usage that
    // actually governs the plan limit would not. Showing two different
    // numbers for "how many uploads this month" on two different pages of
    // the same app was confusing and wrong; this makes them match.
    //
    // "Uploads Today" has no equivalent cumulative counter on Merchant (only
    // total/monthly are tracked), so it necessarily stays a live query.
    const [uploadsToday, activeFields] = await Promise.all([
      this.uploadRepo.createQueryBuilder('u')
        .where('u.merchantId = :merchantId', { merchantId })
        .andWhere('u.createdAt >= :today', { today })
        .andWhere('u.deletedAt IS NULL')
        .getCount(),
      this.fieldRepo.count({ where: { merchantId, isActive: true } }),
    ]);
    const totalUploads = merchant?.totalUploads ?? 0;
    const uploadsThisMonth = merchant?.monthlyUploads ?? 0;

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

    // Without this, a store with activity in only one month (very common
    // for a new install, or a dev/test store like this one) returns a
    // single row — which a bar chart renders as one bar stretched across
    // the whole width, looking like something's broken rather than just
    // "there's one month of data so far." Zero-filling the last 6 months
    // gives the chart proper context either way, the same way the "Daily
    // Uploads (Last 30 Days)" chart already always shows a fixed window.
    const countByMonth = new Map(rows.map((r: any) => [r.month, Number(r.count)]));
    const months = 6;
    const filled: { month: string; count: number }[] = [];
    const cursor = new Date();
    cursor.setDate(1); // avoid month-length rollover issues when subtracting months
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      filled.push({ month: key, count: countByMonth.get(key) ?? 0 });
    }
    return filled;
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
