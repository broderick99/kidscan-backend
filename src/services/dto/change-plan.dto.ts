import { IsEnum, IsNumber, Min, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ServicePickupDayDto } from './service-pickup-day.dto';

export class ChangePlanDto {
  @ApiProperty({ enum: ['single_can', 'double_can', 'triple_can'] })
  @IsEnum(['single_can', 'double_can', 'triple_can'])
  planType: 'single_can' | 'double_can' | 'triple_can';

  @ApiProperty()
  @IsNumber()
  @Min(0)
  pricePerTask: number;

  @ApiProperty({ required: false, type: [ServicePickupDayDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServicePickupDayDto)
  @IsOptional()
  pickupDays?: ServicePickupDayDto[];
}