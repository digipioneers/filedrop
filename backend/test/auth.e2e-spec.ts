import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /auth/install', () => {
    it('should redirect to Shopify OAuth', () => {
      return request(app.getHttpServer())
        .get('/auth/install?shop=test-store.myshopify.com')
        .expect(302)
        .expect((res) => {
          expect(res.headers.location).toContain('myshopify.com/admin/oauth/authorize');
        });
    });

    it('should reject invalid shop domain', () => {
      return request(app.getHttpServer())
        .get('/auth/install?shop=not-a-shopify-domain.com')
        .expect(400);
    });

    it('should require shop parameter', () => {
      return request(app.getHttpServer())
        .get('/auth/install')
        .expect(400);
    });
  });

  describe('GET /auth/verify', () => {
    it('should reject missing JWT', () => {
      return request(app.getHttpServer())
        .get('/auth/verify')
        .expect(401);
    });

    it('should reject invalid JWT', () => {
      return request(app.getHttpServer())
        .get('/auth/verify')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});
