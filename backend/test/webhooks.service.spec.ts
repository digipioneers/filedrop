import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WebhooksService } from '../src/webhooks/webhooks.service';
import { Upload } from '../src/uploads/entities/upload.entity';
import { Merchant } from '../src/auth/entities/merchant.entity';
import { NotificationsService } from '../src/notifications/notifications.service';
import { ProductsService } from '../src/products/products.service';
import { createMock } from '@golevelup/ts-jest';
import { Repository } from 'typeorm';
import * as nock from 'nock';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let uploadRepo: jest.Mocked<Repository<Upload>>;
  let merchantRepo: jest.Mocked<Repository<Merchant>>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let productsService: jest.Mocked<ProductsService>;

  const mockMerchant: Partial<Merchant> = {
    id: 'merchant-1',
    shopDomain: 'test.myshopify.com',
    accessToken: 'shpat_test_token',
    isActive: true,
  };

  const mockOrder = {
    id: 987654321,
    order_number: 1001,
    cart_token: 'abc123cart',
    email: 'customer@example.com',
    customer: { id: 111222333 },
    note: null,
  };

  const mockUploads: Partial<Upload>[] = [
    {
      id: 'upload-1',
      merchantId: 'merchant-1',
      cartToken: 'abc123cart',
      originalFileName: 'photo.jpg',
    },
    {
      id: 'upload-2',
      merchantId: 'merchant-1',
      cartToken: 'abc123cart',
      originalFileName: 'document.pdf',
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: getRepositoryToken(Upload), useValue: createMock<Repository<Upload>>() },
        { provide: getRepositoryToken(Merchant), useValue: createMock<Repository<Merchant>>() },
        { provide: NotificationsService, useValue: createMock<NotificationsService>() },
        { provide: ProductsService, useValue: createMock<ProductsService>() },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
    uploadRepo = module.get(getRepositoryToken(Upload));
    merchantRepo = module.get(getRepositoryToken(Merchant));
    notificationsService = module.get(NotificationsService);
    productsService = module.get(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleOrderCreate', () => {
    it('should associate uploads with order when cart token matches', async () => {
      merchantRepo.findOne.mockResolvedValue(mockMerchant as Merchant);
      uploadRepo.find.mockResolvedValue(mockUploads as Upload[]);
      uploadRepo.update.mockResolvedValue({ affected: 2 } as any);
      notificationsService.notifyUpload.mockResolvedValue(undefined);

      // Mock Shopify API calls
      const shopifyScope = nock('https://test.myshopify.com')
        .post('/admin/api/2024-01/orders/987654321/metafields.json')
        .reply(201, { metafield: { id: 1 } })
        .get('/admin/api/2024-01/orders/987654321.json')
        .reply(200, { order: { note: null } })
        .put('/admin/api/2024-01/orders/987654321.json')
        .reply(200, { order: {} });

      await service.handleOrderCreate('test.myshopify.com', mockOrder);

      expect(uploadRepo.update).toHaveBeenCalledWith(
        ['upload-1', 'upload-2'],
        expect.objectContaining({
          shopifyOrderId: '987654321',
          orderId: '1001',
          customerEmail: 'customer@example.com',
        }),
      );
      expect(notificationsService.notifyUpload).toHaveBeenCalledWith(
        'merchant-1',
        expect.objectContaining({ orderNumber: '1001' }),
      );
    });

    it('should do nothing when merchant not found', async () => {
      merchantRepo.findOne.mockResolvedValue(null);
      await service.handleOrderCreate('unknown.myshopify.com', mockOrder);
      expect(uploadRepo.find).not.toHaveBeenCalled();
    });

    it('should do nothing when no cart token on order', async () => {
      merchantRepo.findOne.mockResolvedValue(mockMerchant as Merchant);
      const orderWithoutCart = { ...mockOrder, cart_token: null };
      await service.handleOrderCreate('test.myshopify.com', orderWithoutCart);
      expect(uploadRepo.find).not.toHaveBeenCalled();
    });

    it('should do nothing when no uploads found for cart', async () => {
      merchantRepo.findOne.mockResolvedValue(mockMerchant as Merchant);
      uploadRepo.find.mockResolvedValue([]);
      await service.handleOrderCreate('test.myshopify.com', mockOrder);
      expect(uploadRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('handleProductUpdate', () => {
    it('should delegate to products service', async () => {
      merchantRepo.findOne.mockResolvedValue(mockMerchant as Merchant);
      productsService.handleProductUpdate.mockResolvedValue(undefined);

      const product = { id: 123, title: 'Updated Product', handle: 'updated-product' };
      await service.handleProductUpdate('test.myshopify.com', product);

      expect(productsService.handleProductUpdate).toHaveBeenCalledWith('merchant-1', product);
    });

    it('should do nothing for unknown shop', async () => {
      merchantRepo.findOne.mockResolvedValue(null);
      await service.handleProductUpdate('unknown.myshopify.com', { id: 1 });
      expect(productsService.handleProductUpdate).not.toHaveBeenCalled();
    });
  });
});
