import { IsNumber, IsString, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty()
  @IsNumber()
  serviceId: number;

  @ApiProperty({ example: '2024-01-15' })
  @IsDateString()
  scheduledDate: string;

  @ApiProperty({ required: false, enum: ['pending', 'completed', 'missed', 'cancelled'] })
  @IsEnum(['pending', 'completed', 'missed', 'cancelled'])
  @IsOptional()
  status?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}