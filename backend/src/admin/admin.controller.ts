import {
  Controller, Get, Put, Body, Param,
  UseGuards, HttpCode, Delete, Post,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Plans ────────────────────────────────────────────────────────────────

  @Get('plans')
  @ApiOperation({ summary: 'Get all plans' })
  getPlans() {
    return this.adminService.getPlans();
  }

  @Put('plans/:id')
  @ApiOperation({ summary: 'Update a plan price and limits' })
  updatePlan(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updatePlan(id, body);
  }

  // ── Merchants ────────────────────────────────────────────────────────────

  @Get('merchants')
  @ApiOperation({ summary: 'Get all merchants' })
  getMerchants() {
    return this.adminService.getMerchants();
  }

  @Get('merchants/:id')
  @ApiOperation({ summary: 'Get merchant details' })
  getMerchant(@Param('id') id: string) {
    return this.adminService.getMerchant(id);
  }

  @Delete('merchants/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a merchant' })
  deleteMerchant(@Param('id') id: string) {
    return this.adminService.deleteMerchant(id);
  }

  // ── Platform metrics ─────────────────────────────────────────────────────

  @Get('metrics')
  @ApiOperation({ summary: 'Get platform-wide metrics' })
  getMetrics() {
    return this.adminService.getMetrics();
  }

  @Get('uploads')
  @ApiOperation({ summary: 'Get all uploads across all merchants' })
  getAllUploads() {
    return this.adminService.getAllUploads();
  }

  // ── App settings ─────────────────────────────────────────────────────────

  @Get('settings')
  @ApiOperation({ summary: 'Get global app settings' })
  getAppSettings() {
    return this.adminService.getAppSettings();
  }

  @Put('settings')
  @ApiOperation({ summary: 'Update global app settings' })
  updateAppSettings(@Body() body: any) {
    return this.adminService.updateAppSettings(body);
  }
}
