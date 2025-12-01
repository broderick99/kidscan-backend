import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ChangePlanDto } from './dto/change-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('services')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @Roles('admin', 'homeowner')
  @ApiResponse({ status: 201, description: 'Service created successfully' })
  create(@Body() createServiceDto: CreateServiceDto, @Request() req) {
    return this.servicesService.create(createServiceDto, req.user.userId, req.user.role);
  }

  @Get()
  @ApiResponse({ status: 200, description: 'Return all services' })
  @ApiQuery({ name: 'teenId', required: false, type: Number })
  @ApiQuery({ name: 'homeId', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  findAll(
    @Request() req,
    @Query('teenId') teenId?: string,
    @Query('homeId') homeId?: string,
    @Query('status') status?: string,
  ) {
    const filters: any = {};
    
    // Apply role-based filters
    if (req.user.role === 'teen') {
      filters.teenId = req.user.userId;
    } else if (req.user.role === 'homeowner') {
      // Homeowner will see services for their homes (handled in service)
      return this.servicesService.findByHomeowner(req.user.userId);
    }
    
    // Apply query filters
    if (teenId) filters.teenId = parseInt(teenId);
    if (homeId) filters.homeId = parseInt(homeId);
    if (status) filters.status = status;
    
    return this.servicesService.findAll(filters);
  }

  @Get('my-services')
  @Roles('teen')
  @ApiResponse({ status: 200, description: 'Return services for current teen' })
  getMyServices(@Request() req) {
    return this.servicesService.findByTeen(req.user.userId);
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Return specific service' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.servicesService.findOne(id);
  }

  @Get(':id/tasks/upcoming')
  @ApiResponse({ status: 200, description: 'Return upcoming tasks for service' })
  getUpcomingTasks(@Param('id', ParseIntPipe) id: number) {
    return this.servicesService.getUpcomingTasks(id);
  }

  @Get(':id/tasks/completed')
  @ApiResponse({ status: 200, description: 'Return completed tasks for service' })
  getCompletedTasks(@Param('id', ParseIntPipe) id: number) {
    return this.servicesService.getCompletedTasks(id);
  }

  @Get(':id/stats')
  @ApiResponse({ status: 200, description: 'Return service statistics' })
  getStats(@Param('id', ParseIntPipe) id: number) {
    return this.servicesService.getStats(id);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, description: 'Service updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() updateServiceDto: UpdateServiceDto,
  ) {
    return this.servicesService.update(
      id,
      req.user.userId,
      updateServiceDto,
      req.user.role
    );
  }

  @Patch(':id/change-plan')
  @Roles('homeowner')
  @ApiResponse({ status: 200, description: 'Service plan changed successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  changePlan(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() changePlanDto: ChangePlanDto,
  ) {
    return this.servicesService.changePlan(
      id,
      req.user.userId,
      changePlanDto,
      req.user.role
    );
  }

  @Delete(':id')
  @ApiResponse({ status: 200, description: 'Service cancelled successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.servicesService.remove(id, req.user.userId, req.user.role);
  }
}