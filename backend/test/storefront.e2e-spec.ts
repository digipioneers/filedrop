import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StorefrontModule } from '../src/storefront/storefront.module';
import { AuthModule } from '../src/auth/auth.module';
import { StorageModule } from '../src/storage/storage.module';
import { SecurityModule } from '../src/security/security.module';
import { EmailModule } from '../src/email/email.module';
import { Merchant } from '../src/auth/entities/merchant.entity';
import { UploadField } from '../src/uploads/entities/upload-field.entity';
import { MerchantSettings } from '../src/settings/entities/merchant-settings.entity';
import { Upload } from '../src/uploads/entities/upload.entity';
import { Plan } from '../src/plans/entities/plan.entity';
import { Subscription } from '../src/billing/entities/subscription.entity';
import { createMock } from '@golevelup/ts-jest';
import { Repository } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';

/**
 * Storefront E2E tests — uses mocked repositories (no external DB needed).
 */
describe('Storefront (e2e)', () => {
  let app: INestApplication;

  const mockMerchantRepo = createMock<Repository<Merchant>>();
  const mockFieldRepo = createMock<Repository<UploadField>>();
  const mockSettingsRepo = createMock<Repository<MerchantSettings>>();
  const mockUploadRepo = createMock<Repository<Upload>>();
  const mockPlanRepo = createMock<Repository<Plan>>();
  const mockSubRepo = createMock<Repository<Subscription>>();

  // Unknown shop → merchant not found
  mockMerchantRepo.findOne.mockResolvedValue(null);
  mockFieldRepo.find.mockResolvedValue([]);

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        StorefrontModule,
        SecurityModule,
        EmailModule,
      ],
    })
      .overrideProvider(getRepositoryToken(Merchant)).useValue(mockMerchantRepo)
      .overrideProvider(getRepositoryToken(UploadField)).useValue(mockFieldRepo)
      .overrideProvider(getRepositoryToken(MerchantSettings)).useValue(mockSettingsRepo)
      .overrideProvider(getRepositoryToken(Upload)).useValue(mockUploadRepo)
      .overrideProvider(getRepositoryToken(Plan)).useValue(mockPlanRepo)
      .overrideProvider(getRepositoryToken(Subscription)).useValue(mockSubRepo)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /api/v1/storefront/fields', () => {
    it('should return 400 when shop param is missing', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storefront/fields')
        .expect(400);
      expect(res.body).toHaveProperty('message');
    });

    it('should return empty result for unknown shop', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storefront/fields?shop=unknown.myshopify.com&productId=123')
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('POST /api/v1/storefront/upload', () => {
    it('should return 400 when no file is attached', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/storefront/upload')
        .field('shop', 'test.myshopify.com')
        .field('uploadFieldId', 'some-field-id')
        .expect(400);
    });

    it('should return 400 when shop param is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/storefront/upload')
        .attach('file', Buffer.from('fake-image-data'), 'test.jpg')
        .expect(400);
    });
  });
});
