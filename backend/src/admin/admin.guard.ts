import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const adminKey = request.headers['x-admin-key'];
    const expectedKey = process.env.ADMIN_SECRET_KEY;

    if (!expectedKey) {
      throw new UnauthorizedException('Admin access not configured');
    }

    if (typeof adminKey !== 'string' || !this.safeEqual(adminKey, expectedKey)) {
      throw new UnauthorizedException('Invalid admin key');
    }

    return true;
  }

  // Constant-time comparison so response timing can't be used to guess the key
  // one character at a time. Compares fixed-length SHA-256 digests to avoid
  // leaking length and to satisfy timingSafeEqual's equal-length requirement.
  private safeEqual(a: string, b: string): boolean {
    const { createHash } = require('crypto') as typeof import('crypto');
    const ha = createHash('sha256').update(a).digest();
    const hb = createHash('sha256').update(b).digest();
    return timingSafeEqual(ha, hb);
  }
}
