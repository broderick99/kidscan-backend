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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { HomesService } from './homes.service';
import { CreateHomeDto } from './dto/create-home.dto';
import { UpdateHomeDto } from './dto/update-home.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('homes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('homes')
export class HomesController {
  constructor(private readonly homesService: HomesService) {}

  @Post()
  @Roles('homeowner', 'admin')
  @ApiResponse({ status: 201, description: 'Home created successfully' })
  create(@Request() req, @Body() createHomeDto: CreateHomeDto) {
    return this.homesService.create(req.user.userId, createHomeDto);
  }

  @Get()
  @ApiResponse({ status: 200, description: 'Return all homes' })
  findAll(@Request() req) {
    // Admins see all homes, others see only their own
    const homeownerId = req.user.role === 'admin' ? undefined : req.user.userId;
    return this.homesService.findAll(homeownerId);
  }

  @Get('my-homes')
  @Roles('homeowner')
  @ApiResponse({ status: 200, description: 'Return homes for current user' })
  getMyHomes(@Request() req) {
    return this.homesService.findByHomeowner(req.user.userId);
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Return specific home' })
  @ApiResponse({ status: 404, description: 'Home not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.homesService.findOne(id);
  }

  @Get(':id/services')
  @ApiResponse({ status: 200, description: 'Return services for a home' })
  getServices(@Param('id', ParseIntPipe) id: number) {
    return this.homesService.getServices(id);
  }

  @Patch(':id')
  @Roles('homeowner', 'admin')
  @ApiResponse({ status: 200, description: 'Home updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Home not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() updateHomeDto: UpdateHomeDto,
  ) {
    const isAdmin = req.user.role === 'admin';
    return this.homesService.update(id, req.user.userId, updateHomeDto, isAdmin);
  }

  @Delete(':id')
  @Roles('homeowner', 'admin')
  @ApiResponse({ status: 200, description: 'Home deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Home not found' })
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const isAdmin = req.user.role === 'admin';
    return this.homesService.remove(id, req.user.userId, isAdmin);
  }
}