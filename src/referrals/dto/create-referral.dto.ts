import { IsEmail, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReferralDto {
  @ApiProperty({ example: 'friend@example.com' })
  @IsEmail()
  referredEmail: string;

  @ApiProperty({ required: false, example: 10.00 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  rewardAmount?: number;
}