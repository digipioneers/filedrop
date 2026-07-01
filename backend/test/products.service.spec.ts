import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductsService } from '../src/products/products.service';
import { Product } from '../src/products/entities/product.entity';
import { Merchant } from '../src/auth/entities/merchant.entity';
import { createMock } from '@golevelup/ts-jest';
import { Repository } from 'typeorm';
import * as nock from 'nock';

describe('ProductsService', () => {
  let service: ProductsService;
  let productRepo: jest.Mocked<Repository<Product>>;
  let merchantRepo: jest.Mocked<Repository<Merchant>>;

  const mockMerchant: Partial<Merchant> = {
    id: 'merchant-1',
    shopDomain: 'test.myshopify.com',
    accessToken: 'shpat_test_token',
    isActive: true,
  };

  const shopifyProductResponse = {
    products: [
      {
        id: 1234567890,
        title: 'Custom T-Shirt',
        handle: 'custom-t-shirt',
        product_type: 'Apparel',
        tags: 'custom, personalized',
        variants: [
          { id: 11111, title: 'Small', sku: 'TS-S', price: '29.99' },
          { id: 22222, title: 'Large', sku: 'TS-L', price: '29.99' },
        ],
        image: { src: 'https://cdn.shopify.com/shirt.jpg' },
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: createMock<Repository<Product>>() },
        { provide: getRepositoryToken(Merchant), useValue: createMock<Repository<Merchant>>() },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    productRepo = module.get(getRepositoryToken(Product));
    merchantRepo = module.get(getRepositoryToken(Merchant));
  });

  afterEach(() => nock.cleanAll());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('syncProducts', () => {
    it('should return zero when merchant not found', async () => {
      merchantRepo.findOne.mockResolvedValue(null);
      const result = await service.syncProducts('merchant-1');
      expect(result).toEqual({ synced: 0 });
    });

    it('should sync products from Shopify API', async () => {
      merchantRepo.findOne.mockResolvedValue(mockMerchant as Merchant);
      productRepo.upsert.mockResolvedValue({ identifiers: [], generatedMaps: [], raw: [] });

      nock('https://test.myshopify.com')
        .get(/products\.json/)
        .reply(200, shopifyProductResponse)
        .get(/collects\.json/)
        .reply(200, { collects: [] });

      const result = await service.syncProducts('merchant-1');
      expect(result.synced).toBe(1);
      expect(productRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: 'merchant-1',
          shopifyProductId: '1234567890',
          title: 'Custom T-Shirt',
          tags: ['custom', 'personalized'],
        }),
        ['merchantId', 'shopifyProductId'],
      );
    });
  });

  describe('searchProducts', () => {
    it('should return products matching title query', async () => {
      const mockProducts: Partial<Product>[] = [
        { id: 'p-1', merchantId: 'merchant-1', title: 'Custom T-Shirt', shopifyProductId: '123' },
      ];
      productRepo.find.mockResolvedValue(mockProducts as Product[]);

      const result = await service.searchProducts('merchant-1', 'Custom');
      expect(result).toHaveLength(1);
      expect(productRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ merchantId: 'merchant-1' }) }),
      );
    });

    it('should return empty when no match', async () => {
      productRepo.find.mockResolvedValue([]);
      const result = await service.searchProducts('merchant-1', 'nonexistent');
      expect(result).toHaveLength(0);
    });
  });

  describe('handleProductUpdate', () => {
    it('should update existing product cache', async () => {
      const existingProduct: Partial<Product> = {
        id: 'p-1',
        merchantId: 'merchant-1',
        shopifyProductId: '123',
        title: 'Old Title',
        collections: [],
      };
      productRepo.findOne.mockResolvedValue(existingProduct as Product);
      merchantRepo.findOne.mockResolvedValue(mockMerchant as Merchant);
      productRepo.save.mockResolvedValue({ ...existingProduct, title: 'New Title' } as Product);

      nock('https://test.myshopify.com')
        .get(/collects\.json/)
        .reply(200, { collects: [] });

      await service.handleProductUpdate('merchant-1', {
        id: 123,
        title: 'New Title',
        handle: 'new-title',
        product_type: '',
        tags: '',
        variants: [],
      });

      expect(productRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'New Title' }),
      );
    });

    it('should do nothing when product not in cache', async () => {
      productRepo.findOne.mockResolvedValue(null);
      await service.handleProductUpdate('merchant-1', { id: 999 });
      expect(productRepo.save).not.toHaveBeenCalled();
    });
  });
});
