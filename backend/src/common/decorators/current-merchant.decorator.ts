import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Merchant } from '../../auth/entities/merchant.entity';

export const CurrentMerchant = createParamDecorator(
  (data: keyof Merchant | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const merchant = request.user as Merchant;
    return data ? merchant?.[data] : merchant;
  },
);
