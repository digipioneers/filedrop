import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SettingsService } from '../src/settings/settings.service';
import { MerchantSettings } from '../src/settings/entities/merchant-settings.entity';
import { createMock } from '@golevelup/ts-jest';
import { Repository } from 'typeorm';

describe('SettingsService', () => {
  let service: SettingsService;
  let settingsRepo: jest.Mocked<Repository<MerchantSettings>>;

  const defaultSettings: Partial<MerchantSettings> = {
    id: 'settings-1',
    merchantId: 'merchant-1',
    buttonColor: '#008060',
    buttonText: 'Upload File',
    buttonBorderRadius: 4,
    language: 'en',
    customMessages: {},
    notifyMerchantOnUpload: true,
    notifyCustomerOnUpload: false,
    signedUrlExpirySeconds: 3600,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: getRepositoryToken(MerchantSettings),
          useValue: createMock<Repository<MerchantSettings>>(),
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
    settingsRepo = module.get(getRepositoryToken(MerchantSettings));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSettings', () => {
    it('should return existing settings', async () => {
      settingsRepo.findOne.mockResolvedValue(defaultSettings as MerchantSettings);
      const result = await service.getSettings('merchant-1');
      expect(result.buttonColor).toBe('#008060');
      expect(result.language).toBe('en');
    });

    it('should create default settings when none exist', async () => {
      settingsRepo.findOne.mockResolvedValue(null);
      settingsRepo.create.mockReturnValue(defaultSettings as MerchantSettings);
      settingsRepo.save.mockResolvedValue(defaultSettings as MerchantSettings);

      const result = await service.getSettings('merchant-1');
      expect(settingsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: 'merchant-1',
          buttonColor: '#008060',
          language: 'en',
        }),
      );
      expect(settingsRepo.save).toHaveBeenCalled();
      expect(result).toEqual(defaultSettings);
    });
  });

  describe('updateSettings', () => {
    it('should update and save settings', async () => {
      settingsRepo.findOne.mockResolvedValue({ ...defaultSettings } as MerchantSettings);
      const updated = { ...defaultSettings, buttonColor: '#ff0000', language: 'es' };
      settingsRepo.save.mockResolvedValue(updated as MerchantSettings);

      const result = await service.updateSettings('merchant-1', {
        buttonColor: '#ff0000',
        language: 'es',
      });

      expect(settingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ buttonColor: '#ff0000', language: 'es' }),
      );
      expect(result.buttonColor).toBe('#ff0000');
    });

    it('should support updating notification preferences', async () => {
      settingsRepo.findOne.mockResolvedValue({ ...defaultSettings } as MerchantSettings);
      const updated = { ...defaultSettings, notifyMerchantOnUpload: false, notificationEmail: 'admin@store.com' };
      settingsRepo.save.mockResolvedValue(updated as MerchantSettings);

      const result = await service.updateSettings('merchant-1', {
        notifyMerchantOnUpload: false,
        notificationEmail: 'admin@store.com',
      });
      expect(result.notifyMerchantOnUpload).toBe(false);
    });
  });

  describe('getPublicSettings', () => {
    it('should return only public fields', async () => {
      settingsRepo.findOne.mockResolvedValue(defaultSettings as MerchantSettings);
      const result = await service.getPublicSettings('merchant-1');

      expect(result).toHaveProperty('buttonColor');
      expect(result).toHaveProperty('buttonText');
      expect(result).toHaveProperty('language');
      // Should NOT expose notification email or internal fields
      expect(result).not.toHaveProperty('notifyMerchantOnUpload');
      expect(result).not.toHaveProperty('notificationEmail');
    });
  });
});
