import { IsNumber, IsString, IsEnum, IsOptional, IsDateString, IsNotEmpty, Min, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ServicePickupDayDto } from './service-pickup-day.dto';

export class CreateServiceDto {
  @ApiProperty()
  @IsNumber()
  teenId: number;

  @ApiProperty()
  @IsNumber()
  homeId: number;

  @ApiProperty({ example: 'Lawn Mowing' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ required: false, example: 'Front and back yard' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ enum: ['weekly', 'biweekly', 'monthly', 'onetime'] })
  @IsEnum(['weekly', 'biweekly', 'monthly', 'onetime'])
  frequency: string;

  @ApiProperty({ example: 25.00 })
  @IsNumber()
  @Min(0)
  pricePerTask: number;

  @ApiProperty({ required: false, enum: ['active', 'paused', 'cancelled'] })
  @IsEnum(['active', 'paused', 'cancelled'])
  @IsOptional()
  status?: string;

  @ApiProperty({ example: '2024-01-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ required: false, example: '2024-12-31' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ required: false, type: [ServicePickupDayDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServicePickupDayDto)
  @IsOptional()
  pickupDays?: ServicePickupDayDto[];
}