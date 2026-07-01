import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SecurityService } from '../src/security/security.service';

describe('SecurityService', () => {
  let service: SecurityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SecurityService],
    }).compile();
    service = module.get<SecurityService>(SecurityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sanitizeFileName', () => {
    it('should remove path traversal sequences', () => {
      expect(service.sanitizeFileName('../../../etc/passwd')).toBe('etcpasswd');
    });

    it('should remove null bytes and control characters', () => {
      expect(service.sanitizeFileName('file\x00name.jpg')).toBe('filename.jpg');
    });

    it('should return "upload" for empty names', () => {
      expect(service.sanitizeFileName('   ')).toBe('upload');
    });

    it('should truncate names longer than 200 chars', () => {
      const longName = 'a'.repeat(200) + '.jpg';
      const result = service.sanitizeFileName(longName);
      expect(result.length).toBeLessThanOrEqual(200);
      expect(result.endsWith('.jpg')).toBe(true);
    });

    it('should preserve normal filenames', () => {
      expect(service.sanitizeFileName('my-photo.jpg')).toBe('my-photo.jpg');
    });
  });

  describe('validateExtension', () => {
    it('should reject blocked extensions', () => {
      expect(service.validateExtension('malware.exe')).toBe(false);
      expect(service.validateExtension('script.php')).toBe(false);
      expect(service.validateExtension('shell.sh')).toBe(false);
    });

    it('should reject path traversal attempts', () => {
      expect(service.validateExtension('../etc/passwd')).toBe(false);
      expect(service.validateExtension('/etc/shadow')).toBe(false);
    });

    it('should accept safe extensions by default', () => {
      expect(service.validateExtension('photo.jpg')).toBe(true);
      expect(service.validateExtension('document.pdf')).toBe(true);
      expect(service.validateExtension('archive.zip')).toBe(true);
    });

    it('should enforce allowlist when provided', () => {
      expect(service.validateExtension('photo.jpg', ['jpg', 'png'])).toBe(true);
      expect(service.validateExtension('photo.gif', ['jpg', 'png'])).toBe(false);
    });

    it('should be case-insensitive for extensions', () => {
      expect(service.validateExtension('photo.JPG', ['jpg'])).toBe(true);
    });
  });

  describe('validateFileSize', () => {
    it('should not throw for files within size range', () => {
      expect(() => service.validateFileSize(5_000_000, 10, 0)).not.toThrow();
    });

    it('should throw BadRequestException when file exceeds max size', () => {
      expect(() => service.validateFileSize(11_000_000, 10)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when file is below min size', () => {
      expect(() => service.validateFileSize(500_000, 10, 1)).toThrow(BadRequestException);
    });

    it('should accept file exactly at max size', () => {
      expect(() => service.validateFileSize(10 * 1024 * 1024, 10)).not.toThrow();
    });
  });

  describe('validateMimeType', () => {
    it('should allow any MIME for custom field type', async () => {
      const buffer = Buffer.from('fake-data');
      const result = await service.validateMimeType(buffer, 'application/octet-stream', 'custom');
      expect(result.valid).toBe(true);
    });

    it('should reject non-image MIME for image field type', async () => {
      // Buffer that doesn't match image magic bytes
      const buffer = Buffer.from('%PDF-1.5 fake pdf content');
      const result = await service.validateMimeType(buffer, 'application/pdf', 'image');
      // PDF mime detected from buffer, not allowed for image fields
      expect(result.valid).toBe(false);
    });
  });
});
