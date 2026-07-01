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
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const provider = config.get<string>('STORAGE_PROVIDER', 'minio');

    if (provider === 'r2') {
      const accountId = config.get<string>('R2_ACCOUNT_ID');
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: config.get<string>('R2_ACCESS_KEY_ID'),
          secretAccessKey: config.get<string>('R2_SECRET_ACCESS_KEY'),
        },
      });
      this.bucket = config.get<string>('R2_BUCKET', 'cfup-uploads');
    } else if (provider === 's3') {
      this.client = new S3Client({
        region: config.get<string>('AWS_REGION', 'us-east-1'),
        credentials: {
          accessKeyId: config.get<string>('AWS_ACCESS_KEY_ID'),
          secretAccessKey: config.get<string>('AWS_SECRET_ACCESS_KEY'),
        },
      });
      this.bucket = config.get<string>('AWS_S3_BUCKET', 'cfup-uploads');
    } else {
      // MinIO (default)
      this.client = new S3Client({
        region: 'us-east-1',
        endpoint: config.get<string>('MINIO_ENDPOINT', 'http://localhost:9000'),
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.get<string>('MINIO_ROOT_USER', 'cfup_minio'),
          secretAccessKey: config.get<string>('MINIO_ROOT_PASSWORD', 'cfup_secret'),
        },
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
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
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
