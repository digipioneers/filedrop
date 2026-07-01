import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Upload } from '../uploads/entities/upload.entity';
import { Merchant } from '../auth/entities/merchant.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Upload)
    private readonly uploadRepo: Repository<Upload>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
  ) {}

  /** Daily upload counts for the last N days. */
  async getDailyUploads(merchantId: string, days = 30) {
    const from = new Date(Date.now() - days * 86_400_000);
    const rows = await this.uploadRepo
      .createQueryBuilder('u')
      .select('DATE(u.createdAt)', 'date')
      .addSelect('COUNT(*)', 'count')
      .where('u.merchantId = :merchantId', { merchantId })
      .andWhere('u.createdAt >= :from', { from })
      .andWhere('u.deletedAt IS NULL')
      .groupBy('DATE(u.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany();

    return this.fillDateGaps(rows, days);
  }

  /** Monthly upload counts for the last 12 months. */
  async getMonthlyUploads(merchantId: string, months = 12) {
    const from = new Date();
    from.setMonth(from.getMonth() - months);

    return this.uploadRepo
      .createQueryBuilder('u')
      .select("DATE_FORMAT(u.createdAt, '%Y-%m')", 'month')
      .addSelect('COUNT(*)', 'count')
      .where('u.merchantId = :merchantId', { merchantId })
      .andWhere('u.createdAt >= :from', { from })
      .andWhere('u.deletedAt IS NULL')
      .groupBy('month')
      .orderBy('month', 'ASC')
      .getRawMany();
  }

  /** Cumulative storage in bytes per day. */
  async getStorageGrowth(merchantId: string, days = 30) {
    const from = new Date(Date.now() - days * 86_400_000);
    const rows = await this.uploadRepo
      .createQueryBuilder('u')
      .select('DATE(u.createdAt)', 'date')
      .addSelect('SUM(CAST(u.fileSizeBytes AS UNSIGNED))', 'dailyBytes')
      .where('u.merchantId = :merchantId', { merchantId })
      .andWhere('u.createdAt >= :from', { from })
      .andWhere('u.deletedAt IS NULL')
      .groupBy('DATE(u.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany();

    // Convert to cumulative
    let cumulative = 0;
    return rows.map((r) => {
      cumulative += Number(r.dailyBytes ?? 0);
      return { date: r.date, bytes: cumulative };
    });
  }

  /** Upload counts grouped by field type. */
  async getUploadsByFieldType(merchantId: string) {
    return this.uploadRepo
      .createQueryBuilder('u')
      .select('u.mimeType', 'mimeType')
      .addSelect('COUNT(*)', 'count')
      .where('u.merchantId = :merchantId', { merchantId })
      .andWhere('u.deletedAt IS NULL')
      .groupBy('u.mimeType')
      .orderBy('count', 'DESC')
      .getRawMany();
  }

  /** Top N upload fields by usage. */
  async getTopFields(merchantId: string, limit = 5) {
    return this.uploadRepo
      .createQueryBuilder('u')
      .select('u.uploadFieldId', 'fieldId')
      .addSelect('COUNT(*)', 'count')
      .where('u.merchantId = :merchantId', { merchantId })
      .andWhere('u.uploadFieldId IS NOT NULL')
      .andWhere('u.deletedAt IS NULL')
      .groupBy('u.uploadFieldId')
      .orderBy('count', 'DESC')
      .limit(limit)
      .getRawMany();
  }

  /** Upload scan status breakdown. */
  async getScanStats(merchantId: string) {
    return this.uploadRepo
      .createQueryBuilder('u')
      .select('u.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('u.merchantId = :merchantId', { merchantId })
      .andWhere('u.deletedAt IS NULL')
      .groupBy('u.status')
      .getRawMany();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private fillDateGaps(rows: { date: string; count: string }[], days: number) {
    const map = new Map(rows.map((r) => [r.date, Number(r.count)]));
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      result.push({ date: key, count: map.get(key) ?? 0 });
    }
    return result;
  }
}
