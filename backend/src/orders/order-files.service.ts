import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Merchant } from '../auth/entities/merchant.entity';
import { Upload } from '../uploads/entities/upload.entity';
import { StorageService } from '../storage/storage.service';
import { ShopifyTokenService } from '../shopify-token/shopify-token.service';

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

@Injectable()
export class OrderFilesService {
  private readonly logger = new Logger(OrderFilesService.name);

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
          `No files were pushed to Shopify for order ${shopifyOrderId}; skipping metafield.`,
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

  /** stagedUploadsCreate → PUT bytes → fileCreate. Returns the file GID. */
  private async pushOneFileToShopify(
    shopDomain: string,
    accessToken: string,
    upload: Upload,
  ): Promise<string | null> {
    const buffer = await this.storageService.getFileBuffer(upload.s3Key);
    const filename = upload.originalFileName || upload.sanitizedFileName || 'upload';
    const mime = upload.mimeType || 'application/octet-stream';

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
            contentType: mime.startsWith('image/') ? 'IMAGE' : 'FILE',
            originalSource: target.resourceUrl,
          },
        ],
      },
    );

    const errs = created?.fileCreate?.userErrors ?? [];
    if (errs.length) {
      throw new Error(`fileCreate errors: ${JSON.stringify(errs)}`);
    }
    return created?.fileCreate?.files?.[0]?.id ?? null;
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
