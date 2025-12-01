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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiResponse, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @Roles('admin', 'homeowner')
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  create(@Body() createTaskDto: CreateTaskDto, @Request() req) {
    return this.tasksService.create(createTaskDto, req.user.userId, req.user.role);
  }

  @Get()
  @ApiResponse({ status: 200, description: 'Return all tasks' })
  @ApiQuery({ name: 'serviceId', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  findAll(
    @Request() req,
    @Query('serviceId') serviceId?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters: any = {};
    
    // Apply role-based filters
    if (req.user.role === 'teen') {
      filters.teenId = req.user.userId;
    }
    
    // Apply query filters
    if (serviceId) filters.serviceId = parseInt(serviceId);
    if (status) filters.status = status;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    
    return this.tasksService.findAll(filters);
  }

  @Get('upcoming')
  @Roles('teen')
  @ApiResponse({ status: 200, description: 'Return upcoming tasks for teen' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getUpcoming(@Request() req, @Query('days') days?: string) {
    const daysNum = days ? parseInt(days) : 7;
    return this.tasksService.findUpcoming(req.user.userId, daysNum);
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Return specific task' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.findOne(id);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, description: 'Task updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() updateTaskDto: UpdateTaskDto,
  ) {
    return this.tasksService.update(
      id,
      req.user.userId,
      updateTaskDto,
      req.user.role
    );
  }

  @Post(':id/complete')
  @Roles('teen')
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Task completed successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @UseInterceptors(FileInterceptor('photo', {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
      files: 1,
    },
    fileFilter: (req, file, callback) => {
      if (file && file.mimetype.match(/^image\/(jpeg|jpg|png|webp)$/)) {
        callback(null, true);
      } else if (file) {
        callback(new Error('Only image files (JPEG, PNG, WebP) are allowed'), false);
      } else {
        callback(null, true); // Allow no file
      }
    },
  }))
  complete(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() completeTaskDto: CompleteTaskDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    // Removed debug logs for production
    
    return this.tasksService.complete(id, req.user.userId, completeTaskDto, photo);
  }

  @Post(':id/cancel')
  @ApiResponse({ status: 200, description: 'Task cancelled successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  cancel(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.tasksService.cancel(id, req.user.userId, req.user.role);
  }

  @Post('generate-recurring')
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Recurring tasks generated' })
  generateRecurring(
    @Body('serviceId') serviceId: number,
    @Body('endDate') endDate: string,
  ) {
    return this.tasksService.generateRecurringTasks(
      serviceId,
      new Date(endDate)
    );
  }
}