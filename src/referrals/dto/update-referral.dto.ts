import { IsNumber, IsString, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateReferralDto {
  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  referredUserId?: number;

  @ApiProperty({ required: false, enum: ['pending', 'registered', 'completed', 'expired'] })
  @IsEnum(['pending', 'registered', 'completed', 'expired'])
  @IsOptional()
  status?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  rewardAmount?: number;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  completedAt?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}