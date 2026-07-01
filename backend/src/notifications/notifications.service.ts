import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType, NotificationStatus } from './entities/notification.entity';
import { EmailService } from '../email/email.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    private readonly emailService: EmailService,
  ) {}

  async create(
    merchantId: string,
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, any>,
  ): Promise<Notification> {
    const notif = this.notifRepo.create({
      merchantId,
      type,
      title,
      message,
      metadata,
    });
    return this.notifRepo.save(notif);
  }

  async notifyUpload(
    merchantId: string,
    uploadInfo: { fileName: string; orderNumber?: string; customerEmail?: string },
  ): Promise<void> {
    await this.create(
      merchantId,
      NotificationType.UPLOAD,
      'New file uploaded',
      uploadInfo.orderNumber
        ? `${uploadInfo.fileName} was uploaded for order #${uploadInfo.orderNumber}`
        : `${uploadInfo.fileName} was uploaded`,
      uploadInfo,
    );
  }

  async notifyVirusDetected(
    merchantId: string,
    uploadInfo: { fileName: string; virusName: string },
  ): Promise<void> {
    await this.create(
      merchantId,
      NotificationType.SECURITY,
      '⚠️ Infected file blocked',
      `Virus detected in ${uploadInfo.fileName}: ${uploadInfo.virusName}`,
      uploadInfo,
    );
    this.logger.warn(
      `Virus notification sent to merchant ${merchantId}: ${uploadInfo.virusName} in ${uploadInfo.fileName}`,
    );
  }

  async notifyStorageNearLimit(merchantId: string, usedPercent: number): Promise<void> {
    await this.create(
      merchantId,
      NotificationType.BILLING,
      'Storage near limit',
      `You have used ${usedPercent}% of your storage quota. Upgrade your plan to avoid disruptions.`,
    );
  }

  async getForMerchant(
    merchantId: string,
    page = 1,
    limit = 20,
    unreadOnly = false,
  ): Promise<{ data: Notification[]; total: number; unreadCount: number }> {
    const qb = this.notifRepo
      .createQueryBuilder('n')
      .where('n.merchantId = :merchantId', { merchantId });

    if (unreadOnly) {
      qb.andWhere('n.status = :status', { status: NotificationStatus.UNREAD });
    }

    qb.orderBy('n.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    const unreadCount = await this.notifRepo.count({
      where: { merchantId, status: NotificationStatus.UNREAD },
    });

    return { data, total, unreadCount };
  }

  async markRead(merchantId: string, notifId: string): Promise<void> {
    await this.notifRepo.update(
      { id: notifId, merchantId },
      { status: NotificationStatus.READ, readAt: new Date() },
    );
  }

  async markAllRead(merchantId: string): Promise<void> {
    await this.notifRepo.update(
      { merchantId, status: NotificationStatus.UNREAD },
      { status: NotificationStatus.READ, readAt: new Date() },
    );
  }
}
