import { IsString, IsEnum, IsOptional, IsDateString, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateServiceDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false, enum: ['weekly', 'biweekly', 'monthly', 'onetime'] })
  @IsEnum(['weekly', 'biweekly', 'monthly', 'onetime'])
  @IsOptional()
  frequency?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  pricePerTask?: number;

  @ApiProperty({ required: false, enum: ['active', 'paused', 'cancelled'] })
  @IsEnum(['active', 'paused', 'cancelled'])
  @IsOptional()
  status?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}