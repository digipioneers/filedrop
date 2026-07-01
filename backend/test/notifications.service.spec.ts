import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationsService } from '../src/notifications/notifications.service';
import { Notification, NotificationType, NotificationStatus } from '../src/notifications/entities/notification.entity';
import { EmailService } from '../src/email/email.service';
import { createMock } from '@golevelup/ts-jest';
import { Repository, SelectQueryBuilder } from 'typeorm';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notifRepo: jest.Mocked<Repository<Notification>>;
  let emailService: jest.Mocked<EmailService>;

  const mockNotif: Partial<Notification> = {
    id: 'notif-1',
    merchantId: 'merchant-1',
    type: NotificationType.UPLOAD,
    title: 'New file uploaded',
    message: 'photo.jpg was uploaded for order #1001',
    status: NotificationStatus.UNREAD,
    createdAt: new Date(),
  };

  const buildQb = (manyAndCount: [Notification[], number] = [[], 0]) => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue(manyAndCount),
  } as unknown as SelectQueryBuilder<Notification>);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: createMock<Repository<Notification>>() },
        { provide: EmailService, useValue: createMock<EmailService>() },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    notifRepo = module.get(getRepositoryToken(Notification));
    emailService = module.get(EmailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create and save a notification', async () => {
      notifRepo.create.mockReturnValue(mockNotif as Notification);
      notifRepo.save.mockResolvedValue(mockNotif as Notification);

      const result = await service.create(
        'merchant-1',
        NotificationType.UPLOAD,
        'New file uploaded',
        'photo.jpg uploaded',
      );

      expect(notifRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: 'merchant-1',
          type: NotificationType.UPLOAD,
          title: 'New file uploaded',
        }),
      );
      expect(notifRepo.save).toHaveBeenCalled();
      expect(result).toEqual(mockNotif);
    });
  });

  describe('notifyUpload', () => {
    it('should create UPLOAD type notification with order info', async () => {
      notifRepo.create.mockReturnValue(mockNotif as Notification);
      notifRepo.save.mockResolvedValue(mockNotif as Notification);

      await service.notifyUpload('merchant-1', {
        fileName: 'photo.jpg',
        orderNumber: '1001',
        customerEmail: 'customer@example.com',
      });

      expect(notifRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.UPLOAD }),
      );
    });

    it('should create upload notification without order info', async () => {
      notifRepo.create.mockReturnValue(mockNotif as Notification);
      notifRepo.save.mockResolvedValue(mockNotif as Notification);

      await service.notifyUpload('merchant-1', { fileName: 'photo.jpg' });
      expect(notifRepo.save).toHaveBeenCalled();
    });
  });

  describe('notifyVirusDetected', () => {
    it('should create SECURITY notification for virus detection', async () => {
      const virusNotif = { ...mockNotif, type: NotificationType.SECURITY };
      notifRepo.create.mockReturnValue(virusNotif as Notification);
      notifRepo.save.mockResolvedValue(virusNotif as Notification);

      await service.notifyVirusDetected('merchant-1', {
        fileName: 'malware.exe',
        virusName: 'EICAR-Test-File',
      });

      expect(notifRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.SECURITY }),
      );
    });
  });

  describe('getForMerchant', () => {
    it('should return paginated notifications with unread count', async () => {
      notifRepo.createQueryBuilder.mockReturnValue(
        buildQb([[mockNotif as Notification], 1]),
      );
      notifRepo.count.mockResolvedValue(3);

      const result = await service.getForMerchant('merchant-1');
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.unreadCount).toBe(3);
    });

    it('should filter unread-only when requested', async () => {
      const qb = buildQb([[], 0]);
      notifRepo.createQueryBuilder.mockReturnValue(qb);
      notifRepo.count.mockResolvedValue(0);

      await service.getForMerchant('merchant-1', 1, 20, true);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'n.status = :status',
        { status: NotificationStatus.UNREAD },
      );
    });
  });

  describe('markRead', () => {
    it('should update notification status to read', async () => {
      notifRepo.update.mockResolvedValue({ affected: 1 } as any);
      await service.markRead('merchant-1', 'notif-1');

      expect(notifRepo.update).toHaveBeenCalledWith(
        { id: 'notif-1', merchantId: 'merchant-1' },
        expect.objectContaining({ status: NotificationStatus.READ }),
      );
    });
  });

  describe('markAllRead', () => {
    it('should mark all unread notifications as read', async () => {
      notifRepo.update.mockResolvedValue({ affected: 5 } as any);
      await service.markAllRead('merchant-1');

      expect(notifRepo.update).toHaveBeenCalledWith(
        { merchantId: 'merchant-1', status: NotificationStatus.UNREAD },
        expect.objectContaining({ status: NotificationStatus.READ }),
      );
    });
  });
});
