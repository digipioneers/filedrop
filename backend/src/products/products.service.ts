import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import axios from 'axios';
import { Product } from './entities/product.entity';
import { Merchant } from '../auth/entities/merchant.entity';
import { ShopifyTokenService } from '../shopify-token/shopify-token.service';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    private readonly shopifyTokenService: ShopifyTokenService,
  ) {}

  /** Fetch all products from Shopify and cache locally. */
  async syncProducts(merchantId: string): Promise<{ synced: number }> {
    const merchant = await this.merchantRepo.findOne({ where: { id: merchantId } });
    if (!merchant) return { synced: 0 };

    let synced = 0;
    let url = `https://${merchant.shopDomain}/admin/api/2026-07/products.json?limit=250&fields=id,title,handle,product_type,tags,variants,image,collections`;
    const accessToken = await this.shopifyTokenService.getValidAccessToken(merchant);

    while (url) {
      const res = await axios.get(url, {
        headers: { 'X-Shopify-Access-Token': accessToken },
      });

      const products: any[] = res.data.products ?? [];

      for (const p of products) {
        const collections = await this.fetchCollectionsForProduct(
          merchant.shopDomain,
          accessToken,
          p.id,
        );

        await this.productRepo.upsert(
          {
            merchantId,
            shopifyProductId: String(p.id),
            title: p.title,
            handle: p.handle,
            productType: p.product_type,
            tags: p.tags ? p.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
            variants: (p.variants ?? []).map((v: any) => ({
              id: String(v.id),
              title: v.title,
              sku: v.sku,
              price: v.price,
            })),
            collections,
            imageUrl: p.image?.src ?? null,
            isActive: true,
          },
          ['merchantId', 'shopifyProductId'],
        );
        synced++;
      }

      // Follow pagination link header
      const linkHeader = res.headers['link'] ?? '';
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      url = nextMatch ? nextMatch[1] : null;
    }

    this.logger.log(`Synced ${synced} products for merchant ${merchantId}`);
    return { synced };
  }

  async searchProducts(merchantId: string, query: string, limit = 20) {
    const products = await this.productRepo.find({
      where: { merchantId, isActive: true, title: Like(`%${query}%`) },
      take: limit,
      order: { title: 'ASC' },
    });
    return products;
  }

  async getCollections(merchantId: string): Promise<{ id: string; title: string }[]> {
    const merchant = await this.merchantRepo.findOne({ where: { id: merchantId } });
    if (!merchant) return [];

    try {
      const accessToken = await this.shopifyTokenService.getValidAccessToken(merchant);
      const res = await axios.get(
        `https://${merchant.shopDomain}/admin/api/2026-07/custom_collections.json?limit=250`,
        { headers: { 'X-Shopify-Access-Token': accessToken } },
      );
      const smart = await axios.get(
        `https://${merchant.shopDomain}/admin/api/2026-07/smart_collections.json?limit=250`,
        { headers: { 'X-Shopify-Access-Token': accessToken } },
      );
      return [
        ...(res.data.custom_collections ?? []),
        ...(smart.data.smart_collections ?? []),
      ].map((c: any) => ({ id: String(c.id), title: c.title }));
    } catch (err) {
      this.logger.error('Failed to fetch collections', err.message);
      return [];
    }
  }

  async handleProductUpdate(merchantId: string, shopifyProduct: any): Promise<void> {
    const existing = await this.productRepo.findOne({
      where: { merchantId, shopifyProductId: String(shopifyProduct.id) },
    });
    if (!existing) return;

    const merchant = await this.merchantRepo.findOne({ where: { id: merchantId } });
    const collections = merchant
      ? await this.fetchCollectionsForProduct(
          merchant.shopDomain,
          await this.shopifyTokenService.getValidAccessToken(merchant),
          shopifyProduct.id,
        )
      : existing.collections;

    await this.productRepo.save({
      ...existing,
      title: shopifyProduct.title,
      handle: shopifyProduct.handle,
      productType: shopifyProduct.product_type,
      tags: shopifyProduct.tags
        ? shopifyProduct.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        : [],
      variants: (shopifyProduct.variants ?? []).map((v: any) => ({
        id: String(v.id),
        title: v.title,
        sku: v.sku,
        price: v.price,
      })),
      collections,
    });
  }

  private async fetchCollectionsForProduct(
    shopDomain: string,
    accessToken: string,
    productId: string | number,
  ): Promise<{ id: string; title: string; handle: string }[]> {
    try {
      const res = await axios.get(
        `https://${shopDomain}/admin/api/2026-07/collects.json?product_id=${productId}`,
        { headers: { 'X-Shopify-Access-Token': accessToken } },
      );
      const collects: any[] = res.data.collects ?? [];
      const collections = await Promise.all(
        collects.slice(0, 5).map(async (c: any) => {
          const cr = await axios
            .get(`https://${shopDomain}/admin/api/2026-07/custom_collections/${c.collection_id}.json`, {
              headers: { 'X-Shopify-Access-Token': accessToken },
            })
            .catch(() => null);
          if (!cr) return null;
          const col = cr.data.custom_collection;
          return { id: String(col.id), title: col.title, handle: col.handle };
        }),
      );
      return collections.filter(Boolean);
    } catch {
      return [];
    }
  }
}
