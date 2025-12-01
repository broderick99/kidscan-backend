import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty({ example: 'refresh_token_string' })
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}