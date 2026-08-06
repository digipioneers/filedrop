import * as crypto from 'crypto';

/**
 * Permanent download-link token helper.
 *
 * S3/R2 presigned URLs are capped at 7 days by the SigV4 signing algorithm —
 * you cannot make a presigned URL that never expires. So when a merchant picks
 * "Never expires" for download links, we don't presign at all. Instead we hand
 * out a permanent app URL:
 *
 *   /api/v1/uploads/:id/download?token=<hmac>
 *
 * The token is an HMAC of the upload id keyed by the app secret, so the link is
 * unguessable and can't be forged without the secret, but never expires. The
 * download route verifies the token, then streams the object from storage.
 *
 * Keep DOWNLOAD_TOKEN_SECRET stable — rotating it invalidates every permanent
 * link already handed out. It falls back to SHOPIFY_API_SECRET so there's
 * always a key, but setting a dedicated secret is cleaner.
 */

function secret(): string {
  const s =
    process.env.DOWNLOAD_TOKEN_SECRET ||
    process.env.SHOPIFY_API_SECRET ||
    '';
  if (!s) {
    // Fail loudly in dev rather than silently signing with an empty key.
    throw new Error(
      'DOWNLOAD_TOKEN_SECRET (or SHOPIFY_API_SECRET) must be set to issue permanent download links.',
    );
  }
  return s;
}

export function makeDownloadToken(uploadId: string): string {
  return crypto
    .createHmac('sha256', secret())
    .update(uploadId)
    .digest('hex');
}

export function verifyDownloadToken(uploadId: string, token: string): boolean {
  if (!token) return false;
  const expected = makeDownloadToken(uploadId);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
