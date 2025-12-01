import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CompleteTaskDto {
  @ApiProperty({ required: false, example: 'https://example.com/photo.jpg' })
  @IsString()
  @IsOptional()
  photoUrl?: string;

  @ApiProperty({ required: false, example: 'Task completed successfully' })
  @IsString()
  @IsOptional()
  notes?: string;
}