import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Merchant } from '../auth/entities/merchant.entity';
import { Upload } from '../uploads/entities/upload.entity';
import { StorageService } from '../storage/storage.service';
import { ShopifyTokenService } from '../shopify-token/shopify-token.service';
import { makeDownloadToken } from '../uploads/download-token.util';

/**
 * Makes customer uploads visible INSIDE the native Shopify order page, with a
 * real thumbnail preview and a working download — not just a text note.
 *
 * How, and why this way
 * ---------------------
 * The old code wrote a text metafield ("Customer uploaded 1 file") plus an
 * order note. Neither shows the actual image in the order. To get a native,
 * previewable, downloadable file on the order we:
 *
 *   1. Pull the file bytes from our own storage.
 *   2. Push them into the store's own Shopify Files (stagedUploadsCreate →
 *      PUT bytes → fileCreate). Now the file lives on the merchant's Shopify
 *      CDN, which is what lets the order UI render and download it.
 *   3. Set an ORDER metafield of type `list.file_reference` pointing at those
 *      files. Shopify renders that natively in the order's Metafields card as
 *      clickable thumbnails with download.
 *
 * This is the same mechanism Shopify's own "file" line-item properties use, so
 * it's review-safe and doesn't depend on any custom order UI.
 *
 * API version is pinned to match the rest of the app (2026-07).
 */

const API_VERSION = '2026-07';
const METAFIELD_NAMESPACE = 'filedrop';
const METAFIELD_KEY = 'customer_uploads';
// Separate URL-list metafield. Needs only write_orders (not write_files), so it
// always works and gives the merchant a clickable link to the customised image
// even when the native file push can't run.
const LINKS_METAFIELD_KEY = 'customer_upload_links';

@Injectable()
export class OrderFilesService {
  private readonly logger = new Logger(OrderFilesService.name);

  // Metafield *values* land on the order via metafieldsSet regardless of
  // whether a definition exists — that part always worked, which is why the
  // files were visible through Filedrop's own order view. But Shopify's
  // admin UI only renders a custom metafield on the native Order page if a
  // matching Metafield Definition exists for that namespace/key. Without
  // one, the data is there but invisible in Shopify's own Orders screen.
  // Track which shops we've already confirmed have the definition so we
  // don't re-issue the mutation on every single order (it's idempotent, but
  // there's no reason to pay the extra API call each time).
  private readonly definitionEnsuredForShop = new Set<string>();
  private readonly linksDefinitionEnsuredForShop = new Set<string>();
  private readonly grantedScopesCache = new Map<string, string[]>();

  constructor(
    private readonly storageService: StorageService,
    private readonly shopifyTokenService: ShopifyTokenService,
  ) {}

  private gqlUrl(shopDomain: string): string {
    return `https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`;
  }

  private async gql<T = any>(
    shopDomain: string,
    accessToken: string,
    query: string,
    variables: any,
  ): Promise<T> {
    const res = await axios.post(
      this.gqlUrl(shopDomain),
      { query, variables },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      },
    );
    if (res.data?.errors?.length) {
      throw new Error(`Shopify GraphQL error: ${JSON.stringify(res.data.errors)}`);
    }
    return res.data.data as T;
  }

  /**
   * Attach the given uploads to a Shopify order so they show on the order page.
   * Best-effort: logs and returns on failure rather than throwing, so a file
   * hiccup never blocks order processing.
   */
  async attachUploadsToOrder(
    merchant: Merchant,
    shopifyOrderId: string,
    uploads: Upload[],
  ): Promise<void> {
    if (!uploads.length) return;

    try {
      const accessToken = await this.shopifyTokenService.getValidAccessToken(merchant);

      // (A) Always attach clickable links first. This uses an order metafield
      // of type list.url, which needs only write_orders — a scope we clearly
      // have, since order notes already work. So even if the native file push
      // below can't run (e.g. the token lacks write_files), the merchant still
      // gets a link on the order that opens the customised image.
      await this.ensureOrderLinksDefinition(merchant.shopDomain, accessToken);
      await this.setOrderLinksMetafield(
        merchant.shopDomain,
        accessToken,
        shopifyOrderId,
        uploads,
      ).catch((e: any) =>
        this.logger.error(`Failed to set order links metafield: ${e?.message}`),
      );

      // (B) Native file thumbnails require the write_files scope. Check it up
      // front so a missing scope becomes ONE clear, actionable log line instead
      // of a silent per-file failure that leaves the card mysteriously empty.
      const scopes = await this.getGrantedScopes(merchant.shopDomain, accessToken);
      const scopesKnown = scopes.length > 0;
      if (scopesKnown && !scopes.includes('write_files')) {
        this.logger.error(
          `❌ Order ${shopifyOrderId} on ${merchant.shopDomain}: the app's access token is ` +
            `MISSING the "write_files" scope, so the customised image can't be pushed to ` +
            `Shopify Files and the native file card will stay empty. A clickable link was ` +
            `still attached. FIX: ensure SHOPIFY_SCOPES includes write_files, then have the ` +
            `merchant reinstall / re-authorize the app so the token is re-granted. ` +
            `Currently granted: ${scopes.join(', ')}`,
        );
        return;
      }

      await this.ensureOrderMetafieldDefinition(merchant.shopDomain, accessToken);

      const fileGids: string[] = [];

      for (const upload of uploads) {
        try {
          const gid = await this.pushOneFileToShopify(
            merchant.shopDomain,
            accessToken,
            upload,
          );
          if (gid) fileGids.push(gid);
        } catch (err: any) {
          this.logger.error(
            `Failed to push upload ${upload.id} to Shopify Files: ${err?.message}`,
          );
        }
      }

      if (!fileGids.length) {
        this.logger.warn(
          `No files were pushed to Shopify for order ${shopifyOrderId}; native file card ` +
            `left empty (clickable links were still attached).`,
        );
        return;
      }

      await this.setOrderFileMetafield(
        merchant.shopDomain,
        accessToken,
        shopifyOrderId,
        fileGids,
      );

      this.logger.log(
        `Attached ${fileGids.length} file(s) to order ${shopifyOrderId} on ${merchant.shopDomain}`,
      );
    } catch (err: any) {
      this.logger.error(`attachUploadsToOrder failed: ${err?.message}`);
    }
  }

  /**
   * Return the scopes actually granted to our token for this shop, via
   * GET /admin/oauth/access_scopes.json. Cached per shop. Returns [] on error,
   * which the caller treats as "unknown" (it will still attempt the file push
   * rather than skip it on a failed diagnostic call).
   */
  private async getGrantedScopes(
    shopDomain: string,
    accessToken: string,
  ): Promise<string[]> {
    const cached = this.grantedScopesCache.get(shopDomain);
    if (cached) return cached;
    try {
      const res = await axios.get(
        `https://${shopDomain}/admin/oauth/access_scopes.json`,
        { headers: { 'X-Shopify-Access-Token': accessToken }, timeout: 10_000 },
      );
      const scopes: string[] = (res.data?.access_scopes || [])
        .map((s: any) => s?.handle)
        .filter(Boolean);
      if (scopes.length) this.grantedScopesCache.set(shopDomain, scopes);
      return scopes;
    } catch (err: any) {
      this.logger.warn(`getGrantedScopes failed for ${shopDomain}: ${err?.message}`);
      return [];
    }
  }

  /** Build the public, token-authed URL that opens/downloads an upload. */
  private buildPreviewUrl(upload: Upload): string {
    const base = (process.env.APP_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
    const token = makeDownloadToken(upload.id);
    return `${base}/api/v1/storefront/file/${upload.id}?token=${token}`;
  }

  /** Create (once per shop) the pinned list.url definition for upload links. */
  private async ensureOrderLinksDefinition(
    shopDomain: string,
    accessToken: string,
  ): Promise<void> {
    if (this.linksDefinitionEnsuredForShop.has(shopDomain)) return;
    try {
      const result = await this.gql(
        shopDomain,
        accessToken,
        `mutation metafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
          metafieldDefinitionCreate(definition: $definition) {
            createdDefinition { id }
            userErrors { field message code }
          }
        }`,
        {
          definition: {
            name: 'Filedrop customer upload links',
            namespace: METAFIELD_NAMESPACE,
            key: LINKS_METAFIELD_KEY,
            type: 'list.url',
            ownerType: 'ORDER',
            pin: true,
          },
        },
      );
      const errs = result?.metafieldDefinitionCreate?.userErrors ?? [];
      const alreadyExists = errs.some(
        (e: any) => e.code === 'TAKEN' || e.message?.toLowerCase().includes('already'),
      );
      if (errs.length && !alreadyExists) {
        this.logger.warn(
          `links metafieldDefinitionCreate errors for ${shopDomain}: ${JSON.stringify(errs)}`,
        );
        return;
      }
      this.linksDefinitionEnsuredForShop.add(shopDomain);
    } catch (err: any) {
      this.logger.error(`ensureOrderLinksDefinition failed for ${shopDomain}: ${err?.message}`);
    }
  }

  /** Set the order's list.url metafield to the uploads' preview links. */
  private async setOrderLinksMetafield(
    shopDomain: string,
    accessToken: string,
    shopifyOrderId: string,
    uploads: Upload[],
  ): Promise<void> {
    const urls = uploads.map((u) => this.buildPreviewUrl(u)).filter(Boolean);
    if (!urls.length) return;
    const orderGid = shopifyOrderId.startsWith('gid://')
      ? shopifyOrderId
      : `gid://shopify/Order/${shopifyOrderId}`;

    const result = await this.gql(
      shopDomain,
      accessToken,
      `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id key namespace }
          userErrors { field message }
        }
      }`,
      {
        metafields: [
          {
            ownerId: orderGid,
            namespace: METAFIELD_NAMESPACE,
            key: LINKS_METAFIELD_KEY,
            type: 'list.url',
            value: JSON.stringify(urls),
          },
        ],
      },
    );
    const errs = result?.metafieldsSet?.userErrors ?? [];
    if (errs.length) {
      throw new Error(`links metafieldsSet errors: ${JSON.stringify(errs)}`);
    }
  }

  /**
   * Create (once per shop) the Metafield Definition that makes
   * `filedrop.customer_uploads` render as a visible, pinned card on
   * Shopify's native Order page. Without this definition the metafield
   * value still gets written fine via metafieldsSet, but Shopify's admin UI
   * has nothing telling it to display that namespace/key, so the file never
   * shows up on the order — even though it's really there.
   * Idempotent and best-effort: a "already exists"/TAKEN userError just
   * means a previous run (or another server instance) already created it.
   *
   * Public so WebhooksService can also call it right after install/reinstall
   * (registerWebhooksForMerchant) — that way the definition exists as soon
   * as possible rather than only lazily on whatever order happens to be the
   * next one with an upload.
   */
  async ensureOrderMetafieldDefinition(
    shopDomain: string,
    accessToken: string,
  ): Promise<void> {
    if (this.definitionEnsuredForShop.has(shopDomain)) return;

    try {
      const result = await this.gql(
        shopDomain,
        accessToken,
        `mutation metafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
          metafieldDefinitionCreate(definition: $definition) {
            createdDefinition { id }
            userErrors { field message code }
          }
        }`,
        {
          definition: {
            name: 'Filedrop customer uploads',
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEY,
            type: 'list.file_reference',
            ownerType: 'ORDER',
            pin: true,
          },
        },
      );

      const errs = result?.metafieldDefinitionCreate?.userErrors ?? [];
      const alreadyExists = errs.some(
        (e: any) => e.code === 'TAKEN' || e.message?.toLowerCase().includes('already'),
      );

      if (errs.length && !alreadyExists) {
        this.logger.warn(
          `metafieldDefinitionCreate errors for ${shopDomain}: ${JSON.stringify(errs)}`,
        );
        return; // don't cache — retry on the next order
      }

      this.definitionEnsuredForShop.add(shopDomain);
      if (!errs.length) {
        this.logger.log(`✅ Order metafield definition created & pinned for ${shopDomain}`);
      }
    } catch (err: any) {
      this.logger.error(
        `ensureOrderMetafieldDefinition failed for ${shopDomain}: ${err?.message}`,
      );
      // don't cache — retry on the next order
    }
  }

  /** stagedUploadsCreate → PUT bytes → fileCreate → wait for READY. Returns the file GID. */
  private async pushOneFileToShopify(
    shopDomain: string,
    accessToken: string,
    upload: Upload,
  ): Promise<string | null> {
    const buffer = await this.storageService.getFileBuffer(upload.s3Key);
    const filename = upload.originalFileName || upload.sanitizedFileName || 'upload';
    const mime = upload.mimeType || 'application/octet-stream';
    const isImage = mime.startsWith('image/');

    // 1) staged target
    const staged = await this.gql(
      shopDomain,
      accessToken,
      `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets { url resourceUrl parameters { name value } }
          userErrors { field message }
        }
      }`,
      {
        input: [
          {
            filename,
            mimeType: mime,
            httpMethod: 'POST',
            resource: 'FILE',
          },
        ],
      },
    );

    const stagedErrs = staged?.stagedUploadsCreate?.userErrors ?? [];
    if (stagedErrs.length) {
      throw new Error(`stagedUploadsCreate errors: ${JSON.stringify(stagedErrs)}`);
    }
    const target = staged?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target?.url) {
      throw new Error('stagedUploadsCreate returned no target');
    }

    // 2) upload bytes to the staged target (multipart form)
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    for (const p of target.parameters as Array<{ name: string; value: string }>) {
      form.append(p.name, p.value);
    }
    form.append('file', buffer, { filename, contentType: mime });

    await axios.post(target.url, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 60_000,
    });

    // 3) create the File record from the staged resource
    const created = await this.gql(
      shopDomain,
      accessToken,
      `mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files { id fileStatus alt }
          userErrors { field message }
        }
      }`,
      {
        files: [
          {
            alt: `Customer upload: ${filename}`,
            contentType: isImage ? 'IMAGE' : 'FILE',
            originalSource: target.resourceUrl,
          },
        ],
      },
    );

    const errs = created?.fileCreate?.userErrors ?? [];
    if (errs.length) {
      throw new Error(`fileCreate errors: ${JSON.stringify(errs)}`);
    }
    const file = created?.fileCreate?.files?.[0];
    const gid: string | null = file?.id ?? null;
    if (!gid) {
      throw new Error('fileCreate returned no file id');
    }

    // 4) CRITICAL: a file created from a staged upload starts as UPLOADED and
    // is processed asynchronously to READY (or FAILED). A list.file_reference
    // metafield can only reference a file that is in the READY state — setting
    // it against an UPLOADED/PROCESSING file fails with a "not in READY state"
    // userError. The old code set the metafield immediately, so it silently
    // failed and the order's file card stayed empty. Wait for READY here so the
    // reference we hand to metafieldsSet is always valid.
    const status =
      file.fileStatus === 'READY'
        ? 'READY'
        : await this.waitForFileReady(shopDomain, accessToken, gid);

    if (status !== 'READY') {
      this.logger.warn(
        `File "${filename}" (${gid}) did not reach READY (status=${status}); ` +
          `skipping its metafield reference to avoid a broken/empty link.`,
      );
      return null;
    }

    return gid;
  }

  /**
   * Poll a file's status until it is READY or FAILED (or we run out of tries).
   * Small customer images normally reach READY within a second or two; the
   * generous ceiling here is safe because attachUploadsToOrder runs in the
   * background, off the webhook's response path.
   */
  private async waitForFileReady(
    shopDomain: string,
    accessToken: string,
    gid: string,
    maxAttempts = 20,
    delayMs = 1000,
  ): Promise<string> {
    const query = `query fileStatus($id: ID!) {
      node(id: $id) { ... on File { fileStatus } }
    }`;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const data = await this.gql(shopDomain, accessToken, query, { id: gid });
        const status = data?.node?.fileStatus;
        if (status === 'READY' || status === 'FAILED') return status;
      } catch (err: any) {
        // Transient read error — keep polling rather than giving up.
        this.logger.warn(`waitForFileReady poll error for ${gid}: ${err?.message}`);
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return 'TIMEOUT';
  }

  /**
   * Recovery path: attach files to an order ONLY if it doesn't already have
   * them. Used from the orders/updated webhook so an order that was linked but
   * whose file push didn't complete (e.g. an earlier transient failure, or a
   * file that hadn't reached READY yet) self-heals without any manual step and
   * without creating duplicate Shopify files on orders that are already fine.
   */
  async attachUploadsIfMissing(
    merchant: Merchant,
    shopifyOrderId: string,
    uploads: Upload[],
  ): Promise<void> {
    if (!uploads.length) return;
    try {
      const accessToken = await this.shopifyTokenService.getValidAccessToken(merchant);
      const existing = await this.getOrderFileMetafieldValue(
        merchant.shopDomain,
        accessToken,
        shopifyOrderId,
      );
      // Value is a JSON array string, e.g. '["gid://shopify/MediaImage/1"]'.
      // Treat null / '[]' / 'null' / '' as "no files attached yet".
      const hasFiles = !!existing && existing !== '[]' && existing !== 'null';
      if (hasFiles) return;

      this.logger.log(
        `Re-attaching files for order ${shopifyOrderId} on ${merchant.shopDomain} (file card was empty).`,
      );
      await this.attachUploadsToOrder(merchant, shopifyOrderId, uploads);
    } catch (err: any) {
      this.logger.error(`attachUploadsIfMissing failed: ${err?.message}`);
    }
  }

  /** Read the order's current filedrop file metafield value (or null). */
  private async getOrderFileMetafieldValue(
    shopDomain: string,
    accessToken: string,
    shopifyOrderId: string,
  ): Promise<string | null> {
    const orderGid = shopifyOrderId.startsWith('gid://')
      ? shopifyOrderId
      : `gid://shopify/Order/${shopifyOrderId}`;
    try {
      const data = await this.gql(
        shopDomain,
        accessToken,
        `query orderMetafield($id: ID!, $ns: String!, $key: String!) {
          order(id: $id) { metafield(namespace: $ns, key: $key) { value } }
        }`,
        { id: orderGid, ns: METAFIELD_NAMESPACE, key: METAFIELD_KEY },
      );
      return data?.order?.metafield?.value ?? null;
    } catch (err: any) {
      this.logger.warn(`getOrderFileMetafieldValue failed: ${err?.message}`);
      return null; // treat as "unknown" → caller will attempt attach
    }
  }

  /** Set (or append to) the order's list.file_reference metafield. */
  private async setOrderFileMetafield(
    shopDomain: string,
    accessToken: string,
    shopifyOrderId: string,
    fileGids: string[],
  ): Promise<void> {
    const orderGid = shopifyOrderId.startsWith('gid://')
      ? shopifyOrderId
      : `gid://shopify/Order/${shopifyOrderId}`;

    const result = await this.gql(
      shopDomain,
      accessToken,
      `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id key namespace }
          userErrors { field message }
        }
      }`,
      {
        metafields: [
          {
            ownerId: orderGid,
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEY,
            type: 'list.file_reference',
            value: JSON.stringify(fileGids),
          },
        ],
      },
    );

    const errs = result?.metafieldsSet?.userErrors ?? [];
    if (errs.length) {
      throw new Error(`metafieldsSet errors: ${JSON.stringify(errs)}`);
    }
  }
}
