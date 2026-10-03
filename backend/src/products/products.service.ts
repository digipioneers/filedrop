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
  // Per-merchant timestamp of the last picker-triggered product sync, used to
  // throttle the incremental refresh (in-memory; fine per instance).
  private readonly lastProductSync = new Map<string, number>();

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    private readonly shopifyTokenService: ShopifyTokenService,
  ) {}

  /** Fetch all products from Shopify and cache locally. */
  async syncProducts(merchantId: string, since?: Date): Promise<{ synced: number }> {
    const merchant = await this.merchantRepo.findOne({ where: { id: merchantId } });
    if (!merchant) return { synced: 0 };

    let synced = 0;
    // When `since` is given, only pull products changed since then — a cheap
    // incremental refresh so newly added products appear without re-fetching
    // the whole catalogue (which also makes a collections call per product).
    const sinceParam = since ? `&updated_at_min=${encodeURIComponent(since.toISOString())}` : '';
    let url = `https://${merchant.shopDomain}/admin/api/2026-07/products.json?limit=250${sinceParam}&fields=id,title,handle,product_type,tags,variants,image,collections`;
    const accessToken = await this.shopifyTokenService.getValidAccessToken(merchant);

    while (url) {
      const pageUrl: string = url;
      const res = await this.shopifyRequestWithRetry(() =>
        axios.get(pageUrl, {
          headers: { 'X-Shopify-Access-Token': accessToken },
        }),
      );

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
    const trimmed = (query ?? '').trim();
    const cachedCount = await this.productRepo.count({ where: { merchantId } });

    const now = Date.now();
    const last = this.lastProductSync.get(merchantId) || 0;

    if (cachedCount === 0) {
      // First use / empty cache: full sync so the picker isn't blank.
      this.lastProductSync.set(merchantId, now);
      this.logger.log(`Product cache empty for merchant ${merchantId}; running a full sync.`);
      try {
        await this.syncProducts(merchantId);
      } catch (err: any) {
        this.logger.error(`On-demand product sync failed: ${err?.message}`);
      }
    } else if (!trimmed && now - last > 10000) {
      // Picker (re)opened: cheaply pull in products created/updated since the
      // last sync so newly added products show up — without re-syncing the
      // whole catalogue. Throttled to avoid repeated syncs on fast re-opens.
      this.lastProductSync.set(merchantId, now);
      const sinceMs = last || now - 30 * 24 * 60 * 60 * 1000; // fall back to last 30 days
      try {
        await this.syncProducts(merchantId, new Date(sinceMs));
      } catch (err: any) {
        this.logger.error(`Incremental product sync failed: ${err?.message}`);
      }
    }

    // Empty query → list the first `limit` products (so opening the picker
    // shows something immediately instead of a blank box).
    const where = trimmed
      ? { merchantId, isActive: true, title: Like(`%${trimmed}%`) }
      : { merchantId, isActive: true };

    let products = await this.productRepo.find({
      where,
      take: limit,
      order: { title: 'ASC' },
    });

    // Live fallback: if the merchant typed a term and the local cache has no
    // match, the product may simply not be cached yet (newly added, or the
    // background sync was slow / rate-limited and never reached it). Instead of
    // showing "No products found" for a product that really exists, ask Shopify
    // directly, cache the hits, then re-read. This is what makes the picker
    // consistent — a product in the store is always findable, not "sometimes".
    if (trimmed && products.length === 0) {
      try {
        const added = await this.liveSearchShopify(merchantId, trimmed, limit);
        if (added > 0) {
          products = await this.productRepo.find({
            where,
            take: limit,
            order: { title: 'ASC' },
          });
        }
      } catch (err: any) {
        this.logger.warn(`Live product search fallback failed: ${err?.message}`);
      }
    }

    return products;
  }

  /**
   * Query Shopify directly for products whose title matches `term`, and upsert
   * them into the local cache. Returns how many products were cached. Used as a
   * fallback when the local LIKE search finds nothing, so the picker never says
   * "No products found" for a product that actually exists in the store.
   *
   * Uses GraphQL (one call, supports partial `title:*term*` matching) and strips
   * gids to the numeric form the rest of the app caches and matches against.
   * Collections are preserved for already-cached rows and left empty for new
   * ones (they get filled by the next full sync / product webhook) — we skip the
   * per-product collection N+1 here to keep the fallback fast.
   */
  private async liveSearchShopify(
    merchantId: string,
    term: string,
    limit: number,
  ): Promise<number> {
    const merchant = await this.merchantRepo.findOne({ where: { id: merchantId } });
    if (!merchant) return 0;

    // Sanitise the term for Shopify's search syntax (drop quotes/backslashes
    // that would break the query string) and wrap in wildcards for partial.
    const safe = term.replace(/["\\]/g, ' ').trim();
    if (!safe) return 0;

    const accessToken = await this.shopifyTokenService.getValidAccessToken(merchant);
    const gql = `
      query ($q: String!, $n: Int!) {
        products(first: $n, query: $q) {
          edges { node {
            id title handle productType tags
            featuredImage { url }
            variants(first: 100) { edges { node { id title sku price } } }
          } }
        }
      }`;

    const res = await this.shopifyRequestWithRetry(() =>
      axios.post(
        `https://${merchant.shopDomain}/admin/api/2026-07/graphql.json`,
        { query: gql, variables: { q: `title:*${safe}*`, n: Math.min(Number(limit) || 20, 100) } },
        { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } },
      ),
    );

    const errors = res.data?.errors;
    if (errors) {
      this.logger.warn(`Live product GraphQL search returned errors: ${JSON.stringify(errors)}`);
      return 0;
    }

    const edges: any[] = res.data?.data?.products?.edges ?? [];
    if (!edges.length) return 0;

    const numericProductId = (gid: string) =>
      String(gid).replace(/^gid:\/\/shopify\/Product\//, '');
    const numericVariantId = (gid: string) =>
      String(gid).replace(/^gid:\/\/shopify\/ProductVariant\//, '');

    let cached = 0;
    for (const edge of edges) {
      const n = edge?.node;
      if (!n) continue;
      const shopifyProductId = numericProductId(n.id);

      // Preserve collections already cached for this product; only new rows
      // start with [] (filled later by full sync / webhook).
      const existing = await this.productRepo.findOne({
        where: { merchantId, shopifyProductId },
      });

      await this.productRepo.upsert(
        {
          merchantId,
          shopifyProductId,
          title: n.title,
          handle: n.handle,
          productType: n.productType,
          tags: Array.isArray(n.tags) ? n.tags : [],
          variants: (n.variants?.edges ?? []).map((ve: any) => ({
            id: numericVariantId(ve?.node?.id),
            title: ve?.node?.title,
            sku: ve?.node?.sku,
            price: ve?.node?.price,
          })),
          collections: existing?.collections ?? [],
          imageUrl: n.featuredImage?.url ?? existing?.imageUrl ?? null,
          isActive: true,
        },
        ['merchantId', 'shopifyProductId'],
      );
      cached++;
    }

    this.logger.log(`Live search cached ${cached} product(s) for "${term}" (merchant ${merchantId}).`);
    return cached;
  }

  /**
   * Call a Shopify endpoint with retry/backoff on 429 (rate limit) and 5xx, so a
   * single throttled response doesn't abort a sync and leave a half-filled cache
   * — one of the causes of the picker intermittently missing products.
   */
  private async shopifyRequestWithRetry<T>(
    fn: () => Promise<T>,
    attempts = 4,
  ): Promise<T> {
    let lastErr: any;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        const status = err?.response?.status;
        const retryable = status === 429 || (status >= 500 && status < 600);
        if (!retryable || i === attempts - 1) throw err;
        const retryAfter = Number(err?.response?.headers?.['retry-after']);
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 500 * 2 ** i; // 0.5s, 1s, 2s backoff
        this.logger.warn(`Shopify ${status} — retrying in ${waitMs}ms (attempt ${i + 1}/${attempts}).`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    throw lastErr;
  }

  async getCollections(merchantId: string): Promise<{ id: string; title: string }[]> {
    const merchant = await this.merchantRepo.findOne({ where: { id: merchantId } });
    if (!merchant) return [];

    const accessToken = await this.shopifyTokenService.getValidAccessToken(merchant);
    const base = `https://${merchant.shopDomain}/admin/api/2026-07`;
    const headers = { 'X-Shopify-Access-Token': accessToken };

    // Primary: GraphQL. One call returns ALL collection types (manual + smart),
    // and it's the current, non-deprecated API — the REST collection endpoints
    // behave inconsistently on some (especially newer, non-dev) stores, which
    // is the most likely reason the list came back empty. IDs are normalised to
    // the numeric form so they match the numeric collection ids we cache on
    // products (what storefront collection-matching compares against).
    try {
      const res = await axios.post(
        `${base}/graphql.json`,
        { query: `{ collections(first: 250) { edges { node { id title } } } }` },
        { headers: { ...headers, 'Content-Type': 'application/json' } },
      );
      const errors = res.data?.errors;
      const edges = res.data?.data?.collections?.edges;
      if (!errors && Array.isArray(edges)) {
        const list = edges
          .map((e: any) => e?.node)
          .filter(Boolean)
          .map((n: any) => ({
            id: String(n.id).replace(/^gid:\/\/shopify\/Collection\//, ''),
            title: n.title,
          }));
        if (list.length) return list;
      } else if (errors) {
        this.logger.warn(`GraphQL collections returned errors: ${JSON.stringify(errors)}`);
      }
    } catch (err: any) {
      this.logger.warn(`GraphQL collections fetch failed, falling back to REST: ${err?.message}`);
    }

    // Fallback: REST custom + smart, each in its OWN try/catch so a failure of
    // one doesn't discard the other (the previous single try/catch returned []
    // — losing already-fetched custom collections — whenever the smart call
    // threw).
    const out: { id: string; title: string }[] = [];
    try {
      const r = await axios.get(`${base}/custom_collections.json?limit=250`, { headers });
      for (const c of r.data?.custom_collections ?? []) out.push({ id: String(c.id), title: c.title });
    } catch (err: any) {
      this.logger.warn(`custom_collections fetch failed: ${err?.message}`);
    }
    try {
      const r = await axios.get(`${base}/smart_collections.json?limit=250`, { headers });
      for (const c of r.data?.smart_collections ?? []) out.push({ id: String(c.id), title: c.title });
    } catch (err: any) {
      this.logger.warn(`smart_collections fetch failed: ${err?.message}`);
    }
    return out;
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
