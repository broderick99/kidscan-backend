import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ProcessPaymentDto } from './dto/process-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @Roles('admin')
  @ApiResponse({ status: 201, description: 'Payment created successfully' })
  create(@Body() createPaymentDto: CreatePaymentDto) {
    return this.paymentsService.create(createPaymentDto);
  }

  @Get()
  @ApiResponse({ status: 200, description: 'Return all payments' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  findAll(
    @Request() req,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters: any = {};
    
    // Teens can only see their own payments
    if (req.user.role === 'teen') {
      filters.teenId = req.user.userId;
    }
    
    if (status) filters.status = status;
    if (type) filters.type = type;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    
    return this.paymentsService.findAll(filters);
  }

  @Get('pending')
  @ApiResponse({ status: 200, description: 'Return pending payments' })
  getPending(@Request() req) {
    const teenId = req.user.role === 'teen' ? req.user.userId : undefined;
    return this.paymentsService.getPendingPayments(teenId);
  }

  @Get('summary')
  @Roles('teen')
  @ApiResponse({ status: 200, description: 'Return payment summary for teen' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  getSummary(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.paymentsService.getPaymentSummary(
      req.user.userId,
      startDate,
      endDate
    );
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Return specific payment' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.paymentsService.findOne(id);
  }

  @Post(':id/process')
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Payment processed successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  process(
    @Param('id', ParseIntPipe) id: number,
    @Body() processPaymentDto: ProcessPaymentDto,
  ) {
    return this.paymentsService.process(id, processPaymentDto);
  }

  @Post('process-batch')
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Payments batch processed' })
  processBatch(@Body('paymentIds') paymentIds: number[]) {
    return this.paymentsService.processBatch(paymentIds);
  }
}