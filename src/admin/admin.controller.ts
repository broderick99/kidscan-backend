import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminService } from './admin.service';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Returns admin statistics' })
  getAdminStats() {
    return this.adminService.getAdminStats();
  }

  @Get('users')
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Returns user breakdown' })
  getUserStats() {
    return this.adminService.getUserStats();
  }

  @Get('services')
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Returns service statistics' })
  getServiceStats() {
    return this.adminService.getServiceStats();
  }

  @Get('revenue')
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Returns revenue statistics' })
  getRevenueStats() {
    return this.adminService.getRevenueStats();
  }

  @Get('growth')
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Returns growth metrics' })
  getGrowthMetrics() {
    return this.adminService.getGrowthMetrics();
  }

  @Get('activity')
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Returns recent activity' })
  getRecentActivity() {
    return this.adminService.getRecentActivity();
  }

  @Get('payouts')
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Returns payout operations overview' })
  getPayoutOperations() {
    return this.adminService.getPayoutOperations();
  }

  @Post('payouts/retry-usage')
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Retries queued Stripe usage reports' })
  retryUsageReports(@Body('limit') limit?: number) {
    return this.adminService.retryUsageReports(limit);
  }

  @Post('payouts/retry-transfers')
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Retries pending Stripe payout transfers' })
  retryPayoutTransfers(@Body('limit') limit?: number) {
    return this.adminService.retryPayoutTransfers(limit);
  }
}
