import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client, PutObjectCommand, DeleteObjectCommand,
  HeadObjectCommand, GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuid } from 'uuid';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  // Separate client used ONLY for presigning download URLs. Presigned URLs
  // bake the client's configured endpoint hostname directly into the link,
  // so if we reused `client` (configured with MinIO's Railway *private*
  // network address for fast, free internal traffic) every download link
  // would point at a `*.railway.internal` host that's only reachable from
  // inside Railway's network — dead on arrival for a browser. This client
  // is configured with a publicly-resolvable endpoint instead, purely for
  // generating links; actual object storage traffic still goes over the
  // private network via `client`.
  private readonly signingClient: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const provider = config.get<string>('STORAGE_PROVIDER', 'minio');

    if (provider === 'r2') {
      const accountId = config.get<string>('R2_ACCOUNT_ID');
      const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
      const credentials = {
        accessKeyId: config.get<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: config.get<string>('R2_SECRET_ACCESS_KEY'),
      };
      this.client = new S3Client({ region: 'auto', endpoint, credentials });
      // R2's endpoint is already publicly reachable, so the signing client
      // can safely reuse the same configuration.
      this.signingClient = this.client;
      this.bucket = config.get<string>('R2_BUCKET', 'cfup-uploads');
    } else if (provider === 's3') {
      const region = config.get<string>('AWS_REGION', 'us-east-1');
      const credentials = {
        accessKeyId: config.get<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: config.get<string>('AWS_SECRET_ACCESS_KEY'),
      };
      this.client = new S3Client({ region, credentials });
      // AWS S3's regional endpoint is already publicly reachable.
      this.signingClient = this.client;
      this.bucket = config.get<string>('AWS_S3_BUCKET', 'cfup-uploads');
    } else {
      // MinIO (default)
      const credentials = {
        accessKeyId: config.get<string>('MINIO_ROOT_USER', 'cfup_minio'),
        secretAccessKey: config.get<string>('MINIO_ROOT_PASSWORD', 'cfup_secret'),
      };
      const internalEndpoint = config.get<string>('MINIO_ENDPOINT', 'http://localhost:9000');
      // MINIO_PUBLIC_ENDPOINT must be MinIO's publicly-reachable Railway
      // domain (Settings → Networking → Public Networking on the MinIO
      // service, giving something like
      // https://minio-bucket-production-xxxx.up.railway.app).
      // Falls back to the internal endpoint if not set, which will still
      // produce broken download links — set this variable to actually fix
      // downloads when using self-hosted MinIO on Railway.
      const publicEndpoint = config.get<string>('MINIO_PUBLIC_ENDPOINT', internalEndpoint);
      if (publicEndpoint === internalEndpoint) {
        this.logger.warn(
          '⚠️  MINIO_PUBLIC_ENDPOINT is not set — presigned download URLs will use the same ' +
          'address as internal traffic. If that address is a *.railway.internal hostname, ' +
          'downloads will fail outside Railway\'s private network. Set MINIO_PUBLIC_ENDPOINT ' +
          'to MinIO\'s public Railway domain.',
        );
      }
      this.client = new S3Client({
        region: 'us-east-1',
        endpoint: internalEndpoint,
        forcePathStyle: true,
        credentials,
      });
      this.signingClient = new S3Client({
        region: 'us-east-1',
        endpoint: publicEndpoint,
        forcePathStyle: true,
        credentials,
      });
      this.bucket = config.get<string>('MINIO_BUCKET', 'cfup-uploads');
    }
  }

  buildKey(merchantId: string, fileId: string, ext: string, orderId?: string): string {
    const folder = orderId ? `order_${orderId}` : `cart_${fileId}`;
    return `${merchantId}/${folder}/uploaded_files/${fileId}.${ext}`;
  }

  async uploadFile(key: string, buffer: Buffer, mimeType: string, metadata?: Record<string, string>): Promise<{ key: string; bucket: string }> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: buffer, ContentType: mimeType,
    }));
    this.logger.log(`Uploaded: ${key}`);
    return { key, bucket: this.bucket };
  }

  async getSignedDownloadUrl(key: string, originalFileName?: string, expiresInSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(originalFileName && {
        ResponseContentDisposition: `attachment; filename="${encodeURIComponent(originalFileName)}"`,
      }),
    });
    return getSignedUrl(this.signingClient, command, { expiresIn: expiresInSeconds });
  }

  async deleteFile(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch { return false; }
  }

  async getFileBuffer(key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const stream = response.Body as any;
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
