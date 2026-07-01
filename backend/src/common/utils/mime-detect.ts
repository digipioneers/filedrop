/**
 * Pure TypeScript MIME type detection from buffer magic bytes.
 * Zero external dependencies.
 */

const SIGNATURES: Array<{ mime: string; bytes: (number | null)[] }> = [
  { mime: 'image/jpeg',      bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png',       bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/gif',       bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp',      bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50] },
  { mime: 'image/bmp',       bytes: [0x42, 0x4d] },
  { mime: 'image/tiff',      bytes: [0x49, 0x49, 0x2a, 0x00] },
  { mime: 'image/tiff',      bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: 'video/mp4',       bytes: [null, null, null, null, 0x66, 0x74, 0x79, 0x70] },
  { mime: 'video/quicktime', bytes: [null, null, null, null, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74] },
  { mime: 'video/webm',      bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { mime: 'video/x-msvideo', bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x41, 0x56, 0x49, 0x20] },
  { mime: 'application/zip', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: 'application/zip', bytes: [0x50, 0x4b, 0x05, 0x06] },
  { mime: 'application/x-rar-compressed', bytes: [0x52, 0x61, 0x72, 0x21] },
  { mime: 'application/x-7z-compressed',  bytes: [0x37, 0x7a, 0xbc, 0xaf] },
  { mime: 'application/msword',            bytes: [0xd0, 0xcf, 0x11, 0xe0] },
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: 'text/plain',      bytes: [0xef, 0xbb, 0xbf] }, // UTF-8 BOM
];

export function detectMimeType(buffer: Buffer): string {
  if (!buffer || buffer.length < 4) return 'application/octet-stream';

  for (const sig of SIGNATURES) {
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (sig.bytes[i] !== null && buffer[i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) return sig.mime;
  }

  // Check if it looks like plain text
  const sample = buffer.slice(0, 512);
  const isText = sample.every(b => (b >= 0x09 && b <= 0x0d) || (b >= 0x20 && b <= 0x7e) || b > 0x7f);
  if (isText) return 'text/plain';

  return 'application/octet-stream';
}
