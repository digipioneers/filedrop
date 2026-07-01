import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * EmailService — pure SMTP, no AWS dependency.
 *
 * Free SMTP options:
 *   Resend      https://resend.com        3,000 emails/mo free
 *   Brevo       https://brevo.com         300 emails/day free
 *   SendGrid    https://sendgrid.com      100 emails/day free
 *   Gmail       smtp.gmail.com            500 emails/day (personal)
 *   Mailhog     localhost (dev only)      Unlimited, catches all emails
 *
 * Set in .env.prod:
 *   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / EMAIL_FROM
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transport: nodemailer.Transporter | null = null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.from = config.get('EMAIL_FROM', 'noreply@yourdomain.com');

    const host = config.get<string>('SMTP_HOST');
    if (!host) {
      this.logger.warn('SMTP_HOST not configured — email notifications disabled');
      return;
    }

    this.transport = nodemailer.createTransport({
      host,
      port: parseInt(config.get('SMTP_PORT', '587')),
      secure: config.get('SMTP_PORT') === '465',
      auth: {
        user: config.get<string>('SMTP_USER'),
        pass: config.get<string>('SMTP_PASS'),
      },
      pool: true,
      maxConnections: 5,
    });

    // Verify connection on startup (non-fatal)
    this.transport.verify().then(() => {
      this.logger.log(`SMTP connected to ${host}`);
    }).catch(err => {
      this.logger.warn(`SMTP connection failed: ${err.message} — emails will be skipped`);
      this.transport = null;
    });
  }

  async send(opts: { to: string; subject: string; html: string; text?: string }): Promise<void> {
    if (!this.transport) return;
    try {
      await this.transport.sendMail({
        from: this.from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      });
      this.logger.log(`Email sent → ${opts.to}: ${opts.subject}`);
    } catch (err) {
      // Email failure must never break the upload flow
      this.logger.error(`Email failed → ${opts.to}: ${err.message}`);
    }
  }

  async sendMerchantUploadNotification(opts: {
    merchantEmail: string;
    shopName: string;
    fileName: string;
    fileSize: string;
    orderId?: string;
    customerEmail?: string;
    downloadUrl: string;
  }): Promise<void> {
    await this.send({
      to: opts.merchantEmail,
      subject: `New file upload${opts.orderId ? ` for Order #${opts.orderId}` : ''} — ${opts.shopName}`,
      html: `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,sans-serif;background:#f5f5f5;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">
    <div style="background:#008060;padding:24px 32px"><h1 style="color:#fff;margin:0;font-size:20px">📎 New File Upload</h1></div>
    <div style="padding:32px">
      <p style="color:#333;margin:0 0 16px">A customer uploaded a file to <strong>${opts.shopName}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px 0;color:#666;width:140px">File</td><td style="padding:8px 0;color:#333;font-weight:600">${opts.fileName}</td></tr>
        <tr><td style="padding:8px 0;color:#666">Size</td><td style="padding:8px 0;color:#333">${opts.fileSize}</td></tr>
        ${opts.orderId ? `<tr><td style="padding:8px 0;color:#666">Order</td><td style="padding:8px 0;color:#333">#${opts.orderId}</td></tr>` : ''}
        ${opts.customerEmail ? `<tr><td style="padding:8px 0;color:#666">Customer</td><td style="padding:8px 0;color:#333">${opts.customerEmail}</td></tr>` : ''}
      </table>
      <a href="${opts.downloadUrl}" style="display:inline-block;background:#008060;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">Download File</a>
      <p style="color:#999;font-size:12px;margin-top:24px">Link expires in 1 hour.</p>
    </div>
  </div>
</body></html>`,
    });
  }

  async sendCustomerUploadConfirmation(opts: {
    customerEmail: string;
    shopName: string;
    fileName: string;
    orderId?: string;
  }): Promise<void> {
    await this.send({
      to: opts.customerEmail,
      subject: `Your file was received — ${opts.shopName}`,
      html: `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,sans-serif;background:#f5f5f5;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">
    <div style="background:#008060;padding:24px 32px"><h1 style="color:#fff;margin:0;font-size:20px">✅ File Received</h1></div>
    <div style="padding:32px">
      <p>Thank you! <strong>${opts.shopName}</strong> has received your file: <strong>${opts.fileName}</strong>.</p>
      ${opts.orderId ? `<p>Order reference: <strong>#${opts.orderId}</strong></p>` : ''}
      <p style="color:#555">The store will review your file and process your order. Contact the store if you have questions.</p>
    </div>
  </div>
</body></html>`,
    });
  }

  async sendVirusDetectedAlert(opts: {
    merchantEmail: string;
    shopName: string;
    fileName: string;
    customerEmail?: string;
  }): Promise<void> {
    await this.send({
      to: opts.merchantEmail,
      subject: `⚠️ Infected file blocked — ${opts.shopName}`,
      html: `
<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;background:#f5f5f5;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:32px">
    <h2 style="color:#d82c0d;margin:0 0 16px">⚠️ Infected File Blocked</h2>
    <p>A file uploaded to <strong>${opts.shopName}</strong> was flagged as malicious and blocked.</p>
    <p><strong>File:</strong> ${opts.fileName}</p>
    ${opts.customerEmail ? `<p><strong>Customer:</strong> ${opts.customerEmail}</p>` : ''}
    <p style="color:#666;font-size:14px">The file is quarantined. No action needed.</p>
  </div>
</body></html>`,
    });
  }
}
