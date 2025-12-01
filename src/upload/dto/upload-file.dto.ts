import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadFileDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'Image file to upload' })
  file: Express.Multer.File;
}

export class ImageProcessingOptionsDto {
  @ApiProperty({ required: false, minimum: 100, maximum: 3840 })
  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(3840)
  maxWidth?: number;

  @ApiProperty({ required: false, minimum: 100, maximum: 2160 })
  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(2160)
  maxHeight?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  quality?: number;

  @ApiProperty({ required: false, enum: ['jpeg', 'png', 'webp'] })
  @IsOptional()
  @IsString()
  format?: 'jpeg' | 'png' | 'webp';
}