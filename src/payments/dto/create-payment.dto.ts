import { IsNumber, IsString, IsEnum, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePaymentDto {
  @ApiProperty()
  @IsNumber()
  teenId: number;

  @ApiProperty({ example: 25.00 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ enum: ['task_completion', 'bonus', 'referral', 'adjustment'] })
  @IsEnum(['task_completion', 'bonus', 'referral', 'adjustment'])
  type: string;

  @ApiProperty({ required: false, enum: ['pending', 'processing', 'completed', 'failed'] })
  @IsEnum(['pending', 'processing', 'completed', 'failed'])
  @IsOptional()
  status?: string;

  @ApiProperty({ required: false, example: 'Payment for lawn mowing' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  referenceId?: number;

  @ApiProperty({ required: false, example: 'task' })
  @IsString()
  @IsOptional()
  referenceType?: string;
}