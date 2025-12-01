import {
  Controller,
  Get,
  UseGuards,
  Request,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { EarningsService } from './earnings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('earnings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('earnings')
export class EarningsController {
  constructor(private readonly earningsService: EarningsService) {}

  @Get()
  @ApiResponse({ status: 200, description: 'Return earnings records' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  findAll(@Request() req, @Query('year') year?: string) {
    const teenId = req.user.role === 'teen' ? req.user.userId : undefined;
    const yearNum = year ? parseInt(year) : undefined;
    return this.earningsService.findAll(teenId, yearNum);
  }

  @Get('current-period')
  @Roles('teen')
  @ApiResponse({ status: 200, description: 'Return current period earnings' })
  getCurrentPeriod(@Request() req) {
    return this.earningsService.getCurrentPeriod(req.user.userId);
  }

  @Get('year-to-date')
  @Roles('teen')
  @ApiResponse({ status: 200, description: 'Return year-to-date earnings' })
  getYearToDate(@Request() req) {
    return this.earningsService.getYearToDate(req.user.userId);
  }

  @Get('breakdown')
  @Roles('teen')
  @ApiResponse({ status: 200, description: 'Return earnings breakdown' })
  @ApiQuery({ name: 'periodStart', required: true, type: String })
  @ApiQuery({ name: 'periodEnd', required: true, type: String })
  getBreakdown(
    @Request() req,
    @Query('periodStart') periodStart: string,
    @Query('periodEnd') periodEnd: string,
  ) {
    return this.earningsService.getBreakdown(
      req.user.userId,
      periodStart,
      periodEnd
    );
  }

  @Get('top-earners')
  @ApiResponse({ status: 200, description: 'Return top earners' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'period', required: false, enum: ['week', 'month', 'year'] })
  getTopEarners(
    @Query('limit') limit?: string,
    @Query('period') period?: 'week' | 'month' | 'year',
  ) {
    const limitNum = limit ? parseInt(limit) : 10;
    return this.earningsService.getTopEarners(limitNum, period);
  }

  @Get('update-pending')
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Update pending amounts' })
  updatePending() {
    return this.earningsService.updatePendingAmounts();
  }
}