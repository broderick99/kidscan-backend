import { 
  Controller, 
  Post, 
  UseInterceptors, 
  UploadedFile, 
  BadRequestException, 
  Body,
  Get
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiResponse } from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { UploadFileDto, ImageProcessingOptionsDto } from './dto/upload-file.dto';
import { UploadResult } from './interfaces/upload.interface';

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Get('health')
  @ApiOperation({ summary: 'Check upload service health and configuration' })
  @ApiResponse({ status: 200, description: 'Upload service status' })
  async getHealth() {
    const isConfigured = await this.uploadService.isConfigured();
    return {
      status: 'ok',
      awsConfigured: isConfigured,
      message: isConfigured 
        ? 'Upload service is fully configured' 
        : 'Upload service running in mock mode (AWS credentials not configured)'
    };
  }

  @Post('image')
  @ApiOperation({ summary: 'Upload an image file' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ 
    status: 201, 
    description: 'Image uploaded successfully'
  })
  @ApiResponse({ status: 400, description: 'Invalid file or request' })
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
      files: 1,
    },
    fileFilter: (req, file, callback) => {
      if (file.mimetype.match(/^image\/(jpeg|jpg|png|webp)$/)) {
        callback(null, true);
      } else {
        callback(new BadRequestException('Only image files (JPEG, PNG, WebP) are allowed'), false);
      }
    },
  }))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Body() options?: ImageProcessingOptionsDto,
  ): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // For general uploads, we'll use task ID 0 (or make it optional in the service)
    return await this.uploadService.uploadTaskPhoto(file, 0, options);
  }
}