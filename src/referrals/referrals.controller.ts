import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Request,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ReferralsService } from './referrals.service';
import { CreateReferralDto } from './dto/create-referral.dto';
import { UpdateReferralDto } from './dto/update-referral.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('referrals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Post()
  @Roles('teen')
  @ApiResponse({ status: 201, description: 'Referral created successfully' })
  @ApiResponse({ status: 409, description: 'Conflict - email already referred or registered' })
  create(@Request() req, @Body() createReferralDto: CreateReferralDto) {
    return this.referralsService.create(req.user.userId, createReferralDto);
  }

  @Get()
  @ApiResponse({ status: 200, description: 'Return all referrals' })
  @ApiQuery({ name: 'status', required: false, type: String })
  findAll(@Request() req, @Query('status') status?: string) {
    const filters: any = {};
    
    // Teens can only see their own referrals
    if (req.user.role === 'teen') {
      filters.referrerId = req.user.userId;
    }
    
    if (status) filters.status = status;
    
    return this.referralsService.findAll(filters);
  }

  @Get('stats')
  @Roles('teen')
  @ApiResponse({ status: 200, description: 'Return referral statistics' })
  getStats(@Request() req) {
    return this.referralsService.getStats(req.user.userId);
  }

  @Get('leaderboard')
  @ApiResponse({ status: 200, description: 'Return referral leaderboard' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getLeaderboard(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit) : 10;
    return this.referralsService.getLeaderboard(limitNum);
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Return specific referral' })
  @ApiResponse({ status: 404, description: 'Referral not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.referralsService.findOne(id);
  }

  @Patch(':id')
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Referral updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Referral not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateReferralDto: UpdateReferralDto,
  ) {
    return this.referralsService.update(id, updateReferralDto);
  }

  @Post(':id/complete')
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Referral completed successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Referral not found' })
  complete(@Param('id', ParseIntPipe) id: number) {
    return this.referralsService.complete(id);
  }

  @Post('expire')
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Expired referrals processed' })
  expire() {
    return this.referralsService.expire();
  }
}