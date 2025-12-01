import { IsEmail, IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'hashed_password' })
  @IsString()
  password_hash: string;

  @ApiProperty({ enum: ['teen', 'homeowner', 'admin'] })
  @IsEnum(['teen', 'homeowner', 'admin'])
  role: string;
}