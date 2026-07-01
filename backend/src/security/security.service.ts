import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as https from 'https';
import { detectMimeType } from '../common/utils/mime-detect';

export enum FieldType {
  IMAGE    = 'image',
  PDF      = 'pdf',
  VIDEO    = 'video',
  ZIP      = 'zip',
  DOCUMENT = 'document',
  CUSTOM   = 'custom',
}

const BLOCKED_EXTENSIONS = new Set([
  'exe','bat','cmd','sh','ps1','php','asp','aspx','jsp',
  'rb','pl','cgi','dll','com','vbs','jar','msi','apk',
  'ipa','scr','pif','reg','htaccess','htpasswd',
]);

const ALLOWED_MIMES: Record<string, Set<string>> = {
  [FieldType.IMAGE]: new Set([
    'image/jpeg','image/png','image/gif','image/webp',
    'image/bmp','image/tiff','image/svg+xml',
  ]),
  [FieldType.PDF]: new Set(['application/pdf']),
  [FieldType.VIDEO]: new Set([
    'video/mp4','video/mpeg','video/quicktime',
    'video/x-msvideo','video/webm',
  ]),
  [FieldType.ZIP]: new Set([
    'application/zip','application/x-zip-compressed',
    'application/x-rar-compressed','application/x-7z-compressed',
  ]),
  [FieldType.DOCUMENT]: new Set([
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv',
  ]),
  [FieldType.CUSTOM]: new Set([]),
};

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);

  validateMimeType(
    buffer: Buffer,
    fieldType: string,
  ): { valid: boolean; detectedMime: string } {
    const detectedMime = detectMimeType(buffer);
    if (fieldType === FieldType.CUSTOM) return { valid: true, detectedMime };
    const allowed = ALLOWED_MIMES[fieldType];
    if (!allowed) return { valid: true, detectedMime };
    return { valid: allowed.has(detectedMime), detectedMime };
  }

  validateExtension(fileName: string, allowedExtensions?: string[]): boolean {
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return false;
    }
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    if (BLOCKED_EXTENSIONS.has(ext)) return false;
    if (allowedExtensions?.length) return allowedExtensions.includes(ext);
    return true;
  }

  validateFileSize(sizeBytes: number, maxSizeMb: number, minSizeMb = 0): void {
    const max = maxSizeMb * 1024 * 1024;
    const min = minSizeMb * 1024 * 1024;
    if (sizeBytes < min) throw new BadRequestException(`File too small (min ${minSizeMb} MB)`);
    if (sizeBytes > max) throw new BadRequestException(`File too large (max ${maxSizeMb} MB)`);
  }

  sanitizeFileName(fileName: string): string {
    let clean = fileName
      .replace(/\.\./g, '')
      .replace(/[/\\]/g, '')
      .replace(/[<>:"|?*\x00-\x1f]/g, '')
      .trim();
    if (clean.length > 200) {
      const ext = clean.split('.').pop() ?? '';
      clean = clean.substring(0, 195) + (ext ? '.' + ext : '');
    }
    return clean || 'upload';
  }

  async scanForViruses(buffer: Buffer): Promise<{ isClean: boolean; virusName?: string }> {
    // EICAR test file hash check
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    if (hash === '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f') {
      return { isClean: false, virusName: 'EICAR-Test-File' };
    }

    const apiKey = process.env.VIRUSTOTAL_API_KEY;
    if (!apiKey) return { isClean: true };

    return this.scanWithVirusTotal(buffer, apiKey);
  }

  private scanWithVirusTotal(
    buffer: Buffer,
    apiKey: string,
  ): Promise<{ isClean: boolean; virusName?: string }> {
    return new Promise((resolve) => {
      try {
        const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
        const body = Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="upload"\r\nContent-Type: application/octet-stream\r\n\r\n`),
          buffer,
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ]);

        const req = https.request({
          hostname: 'www.virustotal.com',
          path: '/api/v3/files',
          method: 'POST',
          headers: {
            'x-apikey': apiKey,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length,
          },
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              const analysisId = json?.data?.id;
              if (!analysisId) return resolve({ isClean: true });
              this.pollVirusTotal(apiKey, analysisId).then(resolve).catch(() => resolve({ isClean: true }));
            } catch {
              resolve({ isClean: true });
            }
          });
        });
        req.on('error', () => resolve({ isClean: true }));
        req.write(body);
        req.end();
      } catch {
        resolve({ isClean: true });
      }
    });
  }

  private pollVirusTotal(
    apiKey: string,
    analysisId: string,
    attempts = 0,
  ): Promise<{ isClean: boolean; virusName?: string }> {
    return new Promise((resolve) => {
      if (attempts >= 8) return resolve({ isClean: true });
      setTimeout(() => {
        const req = https.request({
          hostname: 'www.virustotal.com',
          path: `/api/v3/analyses/${analysisId}`,
          method: 'GET',
          headers: { 'x-apikey': apiKey },
        }, (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              const status = json?.data?.attributes?.status;
              if (status !== 'completed') {
                return resolve(this.pollVirusTotal(apiKey, analysisId, attempts + 1));
              }
              const stats = json?.data?.attributes?.stats ?? {};
              const malicious = (stats.malicious ?? 0) + (stats.suspicious ?? 0);
              if (malicious > 2) {
                const results = json?.data?.attributes?.results ?? {};
                const virusName = Object.values(results as Record<string, any>)
                  .find((r: any) => r.category === 'malicious')?.result ?? 'Unknown';
                return resolve({ isClean: false, virusName });
              }
              resolve({ isClean: true });
            } catch {
              resolve({ isClean: true });
            }
          });
        });
        req.on('error', () => resolve({ isClean: true }));
        req.end();
      }, 4000);
    });
  }
}
