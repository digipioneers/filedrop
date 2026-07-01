import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../src/auth/auth.service';
import { Merchant } from '../src/auth/entities/merchant.entity';
import { createMock } from '@golevelup/ts-jest';
import { Repository } from 'typeorm';

describe('AuthService', () => {
  let service: AuthService;
  let merchantRepo: jest.Mocked<Repository<Merchant>>;

  const mockMerchant: Partial<Merchant> = {
    id: 'merchant-uuid-1',
    shopDomain: 'test-shop.myshopify.com',
    accessToken: 'shpat_test_token',
    isActive: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(Merchant),
          useValue: createMock<Repository<Merchant>>(),
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('signed-jwt-token') },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                SHOPIFY_API_KEY: 'test-api-key',
                SHOPIFY_API_SECRET: 'test-api-secret',
                APP_URL: 'https://app.example.com',
                JWT_SECRET: 'test-jwt-secret',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    merchantRepo = module.get(getRepositoryToken(Merchant));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAuthUrl', () => {
    it('should generate a valid Shopify OAuth URL', () => {
      const url = service.generateAuthUrl('test-shop.myshopify.com', 'csrf-state');
      expect(url).toContain('test-shop.myshopify.com');
      expect(url).toContain('oauth/authorize');
      expect(url).toContain('test-api-key');
      expect(url).toContain('csrf-state');
    });
  });

  describe('validateHmac', () => {
    it('should return false for invalid HMAC', () => {
      const query = { shop: 'test.myshopify.com', hmac: 'invalid' };
      expect(service.validateHmac(query)).toBe(false);
    });
  });

  describe('findById', () => {
    it('should find merchant by id', async () => {
      merchantRepo.findOne.mockResolvedValue(mockMerchant as Merchant);
      const result = await service.findById('merchant-uuid-1');
      expect(result).toEqual(mockMerchant);
      expect(merchantRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'merchant-uuid-1' },
      });
    });

    it('should return null if not found', async () => {
      merchantRepo.findOne.mockResolvedValue(null);
      const result = await service.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('uninstallMerchant', () => {
    it('should mark merchant as inactive', async () => {
      merchantRepo.update.mockResolvedValue({ affected: 1 } as any);
      await service.uninstallMerchant('test-shop.myshopify.com');
      expect(merchantRepo.update).toHaveBeenCalledWith(
        { shopDomain: 'test-shop.myshopify.com' },
        expect.objectContaining({ isActive: false }),
      );
    });
  });
});
