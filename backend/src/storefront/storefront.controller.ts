import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Headers,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  UnauthorizedException,
  Param,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StorefrontService } from './storefront.service';

/**
 * Public API used by the Shopify theme extension (upload-widget.liquid).
 * No JWT required — authenticated via shop domain + HMAC or merchant token
 * embedded in the widget's initialization script.
 */
@ApiTags('Storefront (Public)')
@Controller('storefront')
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  /**
   * GET /storefront/fields
   * Called by the widget on page load to fetch active upload fields for a product.
   */
  @Get('fields')
  @ApiOperation({ summary: 'Get upload fields for a product (public)' })
  getFields(
    @Query('shop') shop: string,
    @Query('merchantId') merchantId: string,
    @Query('productId') productId?: string,
    @Query('variantId') variantId?: string,
    @Query('tags') tags?: string,
  ) {
    const shopOrMerchantId = shop || merchantId;
    if (!shopOrMerchantId) throw new BadRequestException('shop or merchantId is required');
    const tagList = tags ? tags.split(',').map(t => t.trim()) : [];
    return this.storefrontService.getFieldsForProduct(shopOrMerchantId, productId, variantId, tagList);
  }

  /**
   * GET /storefront/settings/:merchantId
   * Widget styling config (button color, text, border radius, language, custom CSS).
   * :merchantId may be either the merchant's UUID or their Shopify shop domain.
   */
  @Get('settings/:merchantId')
  @ApiOperation({ summary: 'Get public storefront settings' })
  getSettings(@Param('merchantId') merchantId: string) {
    return this.storefrontService.getPublicSettings(merchantId);
  }

  /**
   * GET /storefront/preview-template/:fieldId
   * Serves the merchant's mockup image for the product-preview feature.
   * Public/unauthenticated — this is a template photo, not customer data,
   * and needs to load directly in the storefront widget's <canvas> for
   * anonymous shoppers.
   */
  @Get('preview-template/:fieldId')
  @ApiOperation({ summary: 'Get the preview template image for a field (public)' })
  async getPreviewTemplate(@Param('fieldId') fieldId: string, @Res() res: any) {
    const { buffer, mimeType } = await this.storefrontService.getPreviewTemplateFile(fieldId);
    res.set('Content-Type', mimeType);
    res.set('Cache-Control', 'public, max-age=86400'); // template rarely changes; cache a day
    res.send(buffer);
  }

  /**
   * POST /storefront/upload
   * The actual file upload from the customer's browser.
   * merchantId embedded in the widget identifies which store this belongs to.
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Customer file upload (public)' })
  async uploadFile(
    @UploadedFile() file: any,
    @Body('shop') shop: string,
    @Body('merchantId') merchantIdBody: string,
    @Body('fieldId') fieldIdBody: string,
    @Body('uploadFieldId') uploadFieldId: string,
    @Body('cartToken') cartToken?: string,
    @Body('productId') productId?: string,
    @Body('variantId') variantId?: string,
    @Body('customerEmail') customerEmail?: string,
    @Headers('x-shopify-shop-domain') shopDomain?: string,
  ) {
    const shopOrMerchantId = shop || merchantIdBody;
    const fieldId = fieldIdBody || uploadFieldId;
    if (!shopOrMerchantId) throw new BadRequestException('shop or merchantId is required');
    if (!fieldId) throw new BadRequestException('fieldId is required');
    if (!file) throw new BadRequestException('No file provided');

    return this.storefrontService.handleCustomerUpload({
      merchantId: shopOrMerchantId,
      fieldId,
      file,
      cartToken,
      productId,
      variantId,
      customerEmail,
    });
  }

  /**
   * DELETE /storefront/upload/:uploadId
   * Customer removes their file before submitting the order.
   */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('upload/:uploadId')
  @ApiOperation({ summary: 'Customer removes their upload (public)' })
  removeUpload(
    @Param('uploadId') uploadId: string,
    @Query('merchantId') merchantId: string,
    @Query('cartToken') cartToken: string,
  ) {
    return this.storefrontService.removeCustomerUpload(uploadId, merchantId, cartToken);
  }

  /**
   * POST /storefront/upload/rebind-cart-token
   *
   * Shopify does not assign a cart's final, durable token until an item is
   * actually added to it — but this widget uploads files BEFORE "Add to
   * Cart" is clicked, so the token captured at upload time can be a
   * provisional one that never matches order.cart_token later.
   *
   * The widget calls this right after it detects a successful Add to Cart,
   * re-fetching the now-final cart token and re-binding any uploads made
   * earlier in this browser session to it, so order-matching succeeds.
   */
  @Post('upload/rebind-cart-token')
  @ApiOperation({ summary: 'Re-bind uploads to the final cart token after Add to Cart (public)' })
  rebindCartToken(
    @Body('shop') shop: string,
    @Body('merchantId') merchantIdBody: string,
    @Body('uploadIds') uploadIds: string[],
    @Body('oldCartToken') oldCartToken: string,
    @Body('cartToken') cartToken: string,
  ) {
    const shopOrMerchantId = shop || merchantIdBody;
    if (!shopOrMerchantId) throw new BadRequestException('shop or merchantId is required');
    if (!cartToken) throw new BadRequestException('cartToken is required');
    if (!Array.isArray(uploadIds) || !uploadIds.length) {
      throw new BadRequestException('uploadIds is required');
    }
    return this.storefrontService.rebindCartToken(shopOrMerchantId, uploadIds, oldCartToken, cartToken);
  }
}
