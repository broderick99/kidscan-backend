import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Query,
  Get,
} from '@nestjs/common';
import { ApiTags, ApiBody, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SendMagicLinkDto, VerifyMagicLinkDto } from './dto/magic-link.dto';

@ApiTags('auth')
@Controller('auth')
@Public() // All auth endpoints are public
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'User successfully logged in' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: RefreshDto })
  @ApiResponse({ status: 200, description: 'Tokens successfully refreshed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async refresh(@Body() refreshDto: RefreshDto) {
    return this.authService.refresh(refreshDto.refresh_token);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: RefreshDto })
  @ApiResponse({ status: 200, description: 'User successfully logged out' })
  async logout(@Body() refreshDto: RefreshDto) {
    await this.authService.logout(refreshDto.refresh_token);
    return { message: 'Logged out successfully' };
  }

  @Post('magic-link')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: SendMagicLinkDto })
  @ApiResponse({ status: 200, description: 'Magic link sent successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async sendMagicLink(@Body() sendMagicLinkDto: SendMagicLinkDto) {
    return this.authService.sendMagicLink(sendMagicLinkDto);
  }

  @Post('verify-magic-link')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: VerifyMagicLinkDto })
  @ApiResponse({ status: 200, description: 'Magic link verified successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired magic link' })
  async verifyMagicLink(@Body() verifyMagicLinkDto: VerifyMagicLinkDto) {
    return this.authService.verifyMagicLink(verifyMagicLinkDto.token);
  }

  @Get('verify')
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ name: 'token', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Magic link verified successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired magic link' })
  async verifyMagicLinkQuery(@Query('token') token: string) {
    return this.authService.verifyMagicLink(token);
  }
}