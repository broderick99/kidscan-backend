import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('billing')
@Controller('billing')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Post('setup-intent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create setup intent for payment method' })
  @ApiResponse({ status: 200, description: 'Setup intent created successfully' })
  async createSetupIntent(@Request() req) {
    const userId = req.user?.userId || req.user?.id;
    
    if (!userId) {
      throw new Error('User ID not found in request');
    }
    
    return this.billingService.createSetupIntent(userId);
  }

  @Post('create-setup-session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create Stripe Checkout session for payment method setup' })
  @ApiResponse({ status: 200, description: 'Checkout session created successfully' })
  async createSetupSession(
    @Request() req,
    @Body() body: { 
      homeId?: number; 
      planType?: 'single_can' | 'double_can' | 'triple_can';
      successUrl?: string;
      cancelUrl?: string;
    }
  ) {
    const userId = req.user?.userId || req.user?.id;
    
    if (!userId) {
      throw new Error('User ID not found in request');
    }
    
    return this.billingService.createCheckoutSetupSession(userId, body);
  }

  @Post('create-portal-session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create Stripe Customer Portal session for managing payment methods' })
  @ApiResponse({ status: 200, description: 'Portal session created successfully' })
  async createPortalSession(
    @Request() req,
    @Body() body: { 
      returnUrl?: string;
    }
  ) {
    const userId = req.user?.userId || req.user?.id;
    
    if (!userId) {
      throw new Error('User ID not found in request');
    }
    
    return this.billingService.createCustomerPortalSession(userId, body.returnUrl);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get billing status for user' })
  @ApiResponse({ status: 200, description: 'Billing status retrieved successfully' })
  async getBillingStatus(@Request() req) {
    const userId = req.user?.userId || req.user?.id;
    return this.billingService.getBillingStatus(userId);
  }

  @Get('pricing')
  @ApiOperation({ summary: 'Get current pricing information from Stripe' })
  @ApiResponse({ status: 200, description: 'Pricing information retrieved successfully' })
  async getPricing() {
    return this.billingService.getPricingInfo();
  }

  @Get('products')
  @ApiOperation({ summary: 'Get all available Stripe products and prices for debugging' })
  @ApiResponse({ status: 200, description: 'Products and prices retrieved successfully' })
  async getAllProducts() {
    return this.billingService.getAllAvailableProducts();
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create usage-based subscription for home' })
  @ApiResponse({ status: 200, description: 'Subscription created successfully' })
  async createSubscription(
    @Request() req,
    @Body() body: { homeId: number; planType?: 'single_can' | 'double_can' | 'triple_can' }
  ) {
    const userId = req.user?.userId || req.user?.id;
    return this.billingService.createUsageSubscription(userId, body.homeId, body.planType || 'single_can');
  }

  @Post('cancel-subscription')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel subscription at end of billing period' })
  @ApiResponse({ status: 200, description: 'Subscription cancellation scheduled successfully' })
  async cancelSubscription(
    @Request() req,
    @Body() body: { homeId: number }
  ) {
    const userId = req.user?.userId || req.user?.id;
    return this.billingService.cancelSubscriptionAtPeriodEnd(userId, body.homeId);
  }

  @Post('update-subscription-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update subscription to different plan type' })
  @ApiResponse({ status: 200, description: 'Subscription plan updated successfully' })
  async updateSubscriptionPlan(
    @Request() req,
    @Body() body: { homeId: number; planType: 'single_can' | 'double_can' | 'triple_can' }
  ) {
    const userId = req.user?.userId || req.user?.id;
    return this.billingService.updateSubscriptionPlan(userId, body.homeId, body.planType);
  }

  @Get('/usage/:homeId')
  @UseGuards(JwtAuthGuard)
  async getCurrentPeriodUsage(@Param('homeId') homeId: number, @Request() req) {
    const userId = req.user?.userId || req.user?.id;
    return this.billingService.getCurrentPeriodUsage(userId, homeId);
  }

  @Get('/meter-events/:homeId')
  @UseGuards(JwtAuthGuard)
  async getCurrentMeterEvents(@Param('homeId') homeId: number, @Request() req) {
    const userId = req.user?.userId || req.user?.id;
    return this.billingService.getCurrentMeterEvents(userId, homeId);
  }
}