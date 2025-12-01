import { IsString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ProcessPaymentDto {
  @ApiProperty({ enum: ['processing', 'completed', 'failed'] })
  @IsEnum(['processing', 'completed', 'failed'])
  status: string;

  @ApiProperty({ required: false, example: 'Insufficient funds' })
  @IsString()
  @IsOptional()
  failureReason?: string;
}