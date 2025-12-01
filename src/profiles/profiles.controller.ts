import {
  Controller,
  Get,
  Body,
  Patch,
  UseGuards,
  Request,
  Post,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ProfilesService } from './profiles.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('profiles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('me')
  @ApiResponse({ status: 200, description: 'Return current user profile' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  getMyProfile(@Request() req) {
    return this.profilesService.findByUserId(req.user.userId);
  }

  @Patch('me')
  @ApiResponse({ status: 200, description: 'Update current user profile' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  updateMyProfile(@Request() req, @Body() updateProfileDto: UpdateProfileDto) {
    return this.profilesService.update(req.user.userId, updateProfileDto);
  }

  @Post('me/avatar')
  @ApiResponse({ status: 200, description: 'Upload avatar' })
  uploadAvatar(@Request() req, @Body('avatarUrl') avatarUrl: string) {
    return this.profilesService.uploadAvatar(req.user.userId, avatarUrl);
  }

  @Post('me/generate-teen-code')
  @ApiResponse({ status: 200, description: 'Generate teen code for current user' })
  @ApiResponse({ status: 400, description: 'User already has a teen code or is not a teen' })
  generateTeenCode(@Request() req) {
    return this.profilesService.generateTeenCode(req.user.userId, req.user.role);
  }

  @Public()
  @Get('teen-code/:teenCode')
  @ApiResponse({ status: 200, description: 'Find profile by teen code' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  findByTeenCode(@Param('teenCode') teenCode: string) {
    return this.profilesService.findByTeenCode(teenCode);
  }

  @Get('me/referrals')
  @ApiResponse({ status: 200, description: 'Get referral statistics for current user' })
  getReferralStats(@Request() req) {
    return this.profilesService.getReferralStats(req.user.userId);
  }
}