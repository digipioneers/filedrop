import { Controller, Post, Headers, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Merchant } from '../auth/entities/merchant.entity';

@ApiTags('GDPR')
@Controller('gdpr')
export class GdprController {
  private readonly logger = new Logger(GdprController.name);

  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
  ) {}

  @Post('customers/data_request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Customer data request (GDPR)' })
  customerDataRequest(@Body() body: any) {
    this.logger.log(`Customer data request: ${body?.shop_domain}`);
    return { acknowledged: true };
  }

  @Post('customers/redact')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Customer data redaction (GDPR)' })
  customerRedact(@Body() body: any) {
    this.logger.log(`Customer redact: ${body?.shop_domain}`);
    return { acknowledged: true };
  }

  @Post('shop/redact')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Shop data redaction (GDPR)' })
  async shopRedact(@Body() body: any) {
    this.logger.log(`Shop redact: ${body?.shop_domain}`);
    return { acknowledged: true };
  }
}
