import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MerchantSettings } from './entities/merchant-settings.entity';

export interface UpdateSettingsDto {
  buttonColor?: string;
  buttonText?: string;
  buttonBorderRadius?: number;
  language?: string;
  customMessages?: Record<string, string>;
  notifyMerchantOnUpload?: boolean;
  notificationEmail?: string;
  notifyCustomerOnUpload?: boolean;
  signedUrlExpirySeconds?: number;
  customCss?: string;
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(MerchantSettings)
    private readonly settingsRepository: Repository<MerchantSettings>,
  ) {}

  async getSettings(merchantId: string): Promise<MerchantSettings> {
    let settings = await this.settingsRepository.findOne({
      where: { merchantId },
    });

    if (!settings) {
      // Create defaults on first access
      settings = this.settingsRepository.create({
        merchantId,
        buttonColor: '#008060',
        buttonText: 'Upload File',
        buttonBorderRadius: 4,
        language: 'en',
        customMessages: {},
        notifyMerchantOnUpload: true,
        notifyCustomerOnUpload: false,
        signedUrlExpirySeconds: 3600,
        customCss: '',
      });
      await this.settingsRepository.save(settings);
    }

    return settings;
  }

  async updateSettings(
    merchantId: string,
    dto: UpdateSettingsDto,
  ): Promise<MerchantSettings> {
    const settings = await this.getSettings(merchantId);
    if (typeof dto.customCss === 'string') {
      dto.customCss = this.sanitizeCss(dto.customCss);
    }
    Object.assign(settings, dto);
    return this.settingsRepository.save(settings);
  }

  /**
   * Strip content that could break out of the <style> tag the CSS is
   * injected into on the storefront (the widget renders this raw).
   * Not a full CSS parser — just removes the obvious injection vectors.
   */
  private sanitizeCss(css: string): string {
    return css
      .replace(/<\/style\s*>/gi, '')
      .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<[^>]*>/g, '') // strip any remaining HTML tags
      .slice(0, 20000); // reasonable size cap
  }

  async getPublicSettings(merchantId: string): Promise<Partial<MerchantSettings>> {
    const settings = await this.getSettings(merchantId);
    return {
      buttonColor: settings.buttonColor,
      buttonText: settings.buttonText,
      buttonBorderRadius: settings.buttonBorderRadius,
      language: settings.language,
      customMessages: settings.customMessages,
      customCss: settings.customCss || '',
    };
  }
}
