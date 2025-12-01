import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
  Query,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Return all users' })
  @ApiQuery({ name: 'role', required: false })
  findAll(@Query('role') role?: string) {
    if (role) {
      return this.usersService.findByRole(role);
    }
    return this.usersService.findAll();
  }

  @Get('me')
  @ApiResponse({ status: 200, description: 'Return current user' })
  getProfile(@Request() req) {
    return this.usersService.findById(req.user.userId);
  }

  @Get('teen-lookup/:code')
  @ApiResponse({ status: 200, description: 'Return teen by code' })
  @ApiResponse({ status: 404, description: 'Teen not found' })
  findTeenByCode(@Param('code') code: string) {
    return this.usersService.findTeenByCode(code.toUpperCase());
  }

  @Get(':id')
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Return specific user' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findById(id);
  }

  @Patch('me')
  @ApiResponse({ status: 200, description: 'Update current user' })
  updateProfile(@Request() req, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(req.user.userId, updateUserDto);
  }

  @Patch(':id')
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Update specific user' })
  @ApiResponse({ status: 404, description: 'User not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiResponse({ status: 200, description: 'Delete specific user' })
  @ApiResponse({ status: 404, description: 'User not found' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.remove(id);
  }
}