import { Logger } from '@nestjs/common';

/**
 * HEIC/HEIF support.
 *
 * iPhones save photos as HEIC by default. Three things in the pipeline had to
 * change for those to work:
 *
 *   1. Detection — HEIC files start with an ISO-BMFF `ftyp` box whose brand is
 *      one of heic/heix/heif/hevc/mif1/msf1. The old magic-byte table didn't
 *      list HEIC and would mis-read it as video/quicktime (also an ftyp box)
 *      or as application/octet-stream.
 *   2. Acceptance — image/heic / image/heif weren't in the allow-list.
 *   3. Usability — even once stored, browsers can't render HEIC. So we convert
 *      to JPEG server-side on upload and store the JPEG. The customer's file
 *      still uploads; the merchant sees a normal photo.
 *
 * Conversion uses `heic-convert`, which is pure JavaScript (heic-decode +
 * jpeg-js) — no native build step, so it deploys cleanly on Railway where
 * sharp's libheif support would be a headache.
 */

const logger = new Logger('HeicSupport');

/**
 * Detect HEIC/HEIF from the ISO base-media `ftyp` box brand.
 *
 * Layout: bytes 4–7 are 'ftyp', bytes 8–11 are the major brand. We match the
 * known HEIC/HEIF brands. Kept separate from the general magic-byte table
 * because it needs to read the brand at offset 8, not just a fixed prefix.
 */
export function isHeic(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 12) return false;

  // bytes 4..7 must spell "ftyp"
  const isFtyp =
    buffer[4] === 0x66 && // f
    buffer[5] === 0x74 && // t
    buffer[6] === 0x79 && // y
    buffer[7] === 0x70;   // p
  if (!isFtyp) return false;

  const brand = buffer.toString('ascii', 8, 12).toLowerCase();
  const heicBrands = new Set([
    'heic', 'heix', 'heim', 'heis', // HEIC image
    'heif', 'hevc', 'hevx',         // HEIF / HEVC sequences
    'mif1', 'msf1',                 // generic HEIF image / sequence
  ]);
  return heicBrands.has(brand);
}

export interface HeicConversionResult {
  buffer: Buffer;
  mime: string;
  extension: string;
  converted: boolean;
}

/**
 * If the buffer is HEIC, convert it to JPEG and return the JPEG. Otherwise
 * return the original untouched. Never throws for a non-HEIC input.
 *
 * Returns `converted: false` (original bytes) when the input isn't HEIC or if
 * conversion fails for any reason — the caller then validates the original as
 * usual, so a conversion hiccup degrades gracefully instead of losing the file.
 */
export async function convertHeicToJpegIfNeeded(
  buffer: Buffer,
  originalFileName: string,
): Promise<HeicConversionResult> {
  if (!isHeic(buffer)) {
    return { buffer, mime: '', extension: '', converted: false };
  }

  try {
    // Lazy import so the dependency only loads when a HEIC actually arrives.
    const heicConvert = (await import('heic-convert')).default as any;

    const outputBuffer: Buffer = await heicConvert({
      buffer,
      format: 'JPEG',
      quality: 0.92,
    });

    logger.log(
      `Converted HEIC "${originalFileName}" (${buffer.length} bytes) -> JPEG (${outputBuffer.length} bytes)`,
    );

    return {
      buffer: outputBuffer,
      mime: 'image/jpeg',
      extension: 'jpg',
      converted: true,
    };
  } catch (err: any) {
    logger.error(
      `HEIC conversion failed for "${originalFileName}": ${err?.message}. Falling back to original bytes.`,
    );
    return { buffer, mime: '', extension: '', converted: false };
  }
}

/** Swap a .heic/.heif extension for .jpg in a filename after conversion. */
export function renameHeicToJpg(fileName: string): string {
  return fileName.replace(/\.(heic|heif)$/i, '.jpg');
}
