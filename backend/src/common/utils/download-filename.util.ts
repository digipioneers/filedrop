import { Upload } from '../../uploads/entities/upload.entity';

/**
 * Builds a descriptive, collision-proof filename to suggest to the browser
 * when downloading a file — used only for the Content-Disposition header on
 * signed download URLs and email links. Does NOT change what's stored in
 * S3/MinIO (storage keys are already unique UUIDs) or what's shown as the
 * "original file name" anywhere in the app's UI — this only affects what a
 * merchant's browser names the file once it lands on their disk.
 *
 * Why this matters: many uploads share the exact same original name (e.g.
 * every file exported from the widget's "Design Your Product" canvas tool
 * is named "custom-design.png"). Downloading several of these into the
 * same folder would silently overwrite earlier ones. This builds a name
 * like:
 *   Order-1013-jane-a3f9c2.png   (order already linked)
 *   Upload-tirthabig0-a3f9c2.png (no order yet — e.g. "All Uploads" admin view)
 *   Upload-a3f9c2.png            (no order and no customer email on file)
 */
export function buildDownloadFilename(upload: Pick<Upload, 'id' | 'originalFileName' | 'shopifyOrderId' | 'orderId' | 'customerEmail'>): string {
  const ext = (upload.originalFileName?.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const shortId = upload.id.replace(/-/g, '').slice(-6);

  const orderLabel = upload.orderId
    ? `Order-${sanitizeSegment(upload.orderId)}`
    : 'Upload';

  const customerLabel = upload.customerEmail
    ? sanitizeSegment(upload.customerEmail.split('@')[0])
    : null;

  const parts = [orderLabel, customerLabel, shortId].filter(Boolean);
  return `${parts.join('-')}.${ext}`;
}

function sanitizeSegment(s: string): string {
  return String(s)
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}
