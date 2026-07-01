import {
  Controller, Get, Post, Put, Delete, Patch, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile, Request, ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PlanLimitGuard } from '../common/guards/plan-limit.guard';
import { UploadsService } from './uploads.service';
import { CreateUploadFieldDto } from './dto/create-upload-field.dto';
import { UpdateUploadFieldDto } from './dto/update-upload-field.dto';
import { UploadFileDto } from './dto/upload-file.dto';

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  // ─── Upload Fields (Merchant) ───────────────────────────────────────────────

  @Post('fields')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an upload field' })
  createField(@Request() req, @Body() dto: CreateUploadFieldDto) {
    return this.uploadsService.createField(req.user.id, dto);
  }

  @Get('fields')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all upload fields for merchant' })
  findAllFields(@Request() req) {
    return this.uploadsService.findAllFields(req.user.id);
  }

  @Get('fields/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  findField(@Request() req, @Param('id') id: string) {
    return this.uploadsService.findField(req.user.id, id);
  }

  @Put('fields/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  updateField(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateUploadFieldDto,
  ) {
    return this.uploadsService.updateField(req.user.id, id, dto);
  }

  @Patch('fields/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an upload field (PATCH alias for PUT)' })
  updateFieldPatch(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateUploadFieldDto,
  ) {
    return this.uploadsService.updateField(req.user.id, id, dto);
  }

  @Delete('fields/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  deleteField(@Request() req, @Param('id') id: string) {
    return this.uploadsService.deleteField(req.user.id, id);
  }

  // ─── Storefront API (public — called from theme extension) ─────────────────

  @Get('fields/storefront')
  @ApiOperation({ summary: 'Get upload fields for a product (storefront)' })
  getFieldsForProduct(
    @Query('shop') shop: string,
    @Query('productId') productId: string,
    @Query('variantId') variantId?: string,
    @Query('tags') tags?: string,
    @Query('collectionIds') collectionIds?: string,
  ) {
    return this.uploadsService.getFieldsForProduct(
      shop,
      productId,
      variantId,
      tags ? tags.split(',') : [],
      collectionIds ? collectionIds.split(',') : [],
    );
  }

  // ─── File Upload (Storefront — customers) ──────────────────────────────────

  /**
   * POST /api/v1/uploads
   * Called from the product page theme extension.
   * Rate limited per IP, plan-limited per merchant.
   */
  @Post()
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB hard cap (plan enforced in service)
      storage: undefined, // Use memory storage — we handle S3 ourselves
    }),
  )
  @ApiOperation({ summary: 'Upload a file (merchant-authenticated; e.g. testing from the admin)' })
  @ApiConsumes('multipart/form-data')
  uploadFile(
    @Request() req: any,
    @UploadedFile() file: any,
    @Body() dto: UploadFileDto,
  ) {
    return this.uploadsService.uploadFile(req.user.id, file, dto);
  }

  // ─── Merchant upload management ────────────────────────────────────────────

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all uploads for merchant' })
  findAll(
    @Request() req,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('orderId') orderId?: string,
  ) {
    return this.uploadsService.findAll(req.user.id, page, limit, orderId);
  }

  @Get(':id/url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get signed download URL for an upload' })
  getSignedUrl(@Request() req, @Param('id') id: string) {
    return this.uploadsService.getSignedUrl(req.user.id, id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an upload' })
  deleteUpload(@Request() req, @Param('id') id: string) {
    return this.uploadsService.deleteUpload(req.user.id, id);
  }
}
