import { IsEmail, IsNotEmpty, IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMagicLinkDto {
  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ enum: ['signin', 'signup'] })
  @IsString()
  @IsIn(['signin', 'signup'])
  @IsNotEmpty()
  mode: 'signin' | 'signup';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ enum: ['teen', 'homeowner'] })
  @IsOptional()
  @IsString()
  @IsIn(['teen', 'homeowner'])
  role?: 'teen' | 'homeowner';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referredByTeenCode?: string;
}

export class VerifyMagicLinkDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;
}