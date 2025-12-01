import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import * as sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { 
  UploadResult, 
  ProcessedImageOptions, 
  FileUploadConfig,
  S3Config 
} from './interfaces/upload.interface';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private s3Client: S3Client;
  private uploadConfig: FileUploadConfig;
  private s3Config: S3Config;

  constructor() {
    // Initialize configuration
    this.s3Config = {
      region: process.env.AWS_S3_REGION || 'us-east-1',
      bucket: process.env.AWS_S3_BUCKET || 'kidscan-uploads-dev',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };

    this.uploadConfig = {
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880'), // 5MB default
      allowedMimeTypes: process.env.ALLOWED_FILE_TYPES?.split(',') || [
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'image/webp'
      ],
      processingOptions: {
        maxWidth: 1920,
        maxHeight: 1080,
        quality: 85,
        format: 'jpeg'
      }
    };

    // Initialize S3 client
    this.initializeS3Client();
  }

  private initializeS3Client() {
    try {
      this.s3Client = new S3Client({
        region: this.s3Config.region,
        credentials: this.s3Config.accessKeyId && this.s3Config.secretAccessKey ? {
          accessKeyId: this.s3Config.accessKeyId,
          secretAccessKey: this.s3Config.secretAccessKey,
        } : undefined, // Use default credential chain if not provided
      });
      this.logger.log('S3 client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize S3 client:', error);
    }
  }

  async uploadTaskPhoto(
    file: Express.Multer.File, 
    taskId: number,
    processingOptions?: ProcessedImageOptions
  ): Promise<UploadResult> {
    try {
      // Upload task photo

      // Validate file
      this.validateFile(file);
      // File validation passed

      // Process image
      const processedBuffer = await this.processImage(file.buffer, {
        ...this.uploadConfig.processingOptions,
        ...processingOptions,
      });
      // Image processed successfully

      // Generate unique filename
      const filename = this.generateFilename(file.originalname, taskId);
      // Generated unique filename

      // If AWS credentials are not available, return a mock URL
      if (!this.s3Config.accessKeyId || !this.s3Config.secretAccessKey) {
        this.logger.warn('AWS credentials not configured, returning mock URL');
        const mockUrl = `https://${this.s3Config.bucket}.s3.${this.s3Config.region}.amazonaws.com/${filename}`;
        return {
          url: mockUrl,
          key: filename,
          bucket: this.s3Config.bucket,
          originalName: file.originalname,
          size: processedBuffer.length,
          mimeType: `image/${this.uploadConfig.processingOptions.format}`,
        };
      }

      // Upload to S3
      // Starting S3 upload
      const uploadResult = await this.uploadToS3(processedBuffer, filename, file.mimetype);
      // S3 upload completed

      return {
        url: uploadResult.url,
        key: uploadResult.key,
        bucket: this.s3Config.bucket,
        originalName: file.originalname,
        size: processedBuffer.length,
        mimeType: `image/${this.uploadConfig.processingOptions.format}`,
      };

    } catch (error) {
      this.logger.error(`Failed to upload task photo for task ${taskId}:`, error);
      throw error;
    }
  }

  private validateFile(file: Express.Multer.File): void {
    // Validate file properties

    if (!file) {
      // No file provided
      throw new BadRequestException('No file provided');
    }

    // Check file size
    if (file.size > this.uploadConfig.maxFileSize) {
      // File too large
      throw new BadRequestException(
        `File too large. Maximum size is ${this.uploadConfig.maxFileSize / 1024 / 1024}MB`
      );
    }

    // Check mime type
    if (!this.uploadConfig.allowedMimeTypes.includes(file.mimetype)) {
      // Invalid mime type
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${this.uploadConfig.allowedMimeTypes.join(', ')}`
      );
    }

    // Additional validation for image files
    if (!file.mimetype.startsWith('image/')) {
      // Not an image file
      throw new BadRequestException('File must be an image');
    }
  }

  private async processImage(
    buffer: Buffer, 
    options: ProcessedImageOptions
  ): Promise<Buffer> {
    try {
      let sharpInstance = sharp(buffer);

      // Resize if dimensions are specified
      if (options.maxWidth || options.maxHeight) {
        sharpInstance = sharpInstance.resize(options.maxWidth, options.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Convert format and set quality
      switch (options.format) {
        case 'jpeg':
          sharpInstance = sharpInstance.jpeg({ 
            quality: options.quality || 85,
            progressive: true 
          });
          break;
        case 'png':
          sharpInstance = sharpInstance.png({ 
            quality: options.quality || 85,
            progressive: true 
          });
          break;
        case 'webp':
          sharpInstance = sharpInstance.webp({ 
            quality: options.quality || 85 
          });
          break;
        default:
          sharpInstance = sharpInstance.jpeg({ 
            quality: options.quality || 85,
            progressive: true 
          });
      }

      const processedBuffer = await sharpInstance.toBuffer();
      
      this.logger.debug(`Image processed: ${buffer.length} → ${processedBuffer.length} bytes`);
      
      return processedBuffer;

    } catch (error) {
      this.logger.error('Image processing failed:', error);
      throw new BadRequestException('Failed to process image');
    }
  }

  private generateFilename(originalName: string, taskId: number): string {
    const timestamp = Date.now();
    const uuid = uuidv4();
    const extension = this.uploadConfig.processingOptions.format || 'jpg';
    
    // Clean original filename
    const cleanName = originalName
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .substring(0, 50);
    
    return `task-photos/${taskId}/${timestamp}-${uuid}-${cleanName}.${extension}`;
  }

  private async uploadToS3(
    buffer: Buffer, 
    key: string, 
    contentType: string
  ): Promise<{ url: string; key: string }> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.s3Config.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'max-age=31536000', // 1 year cache
        Metadata: {
          uploadedAt: new Date().toISOString(),
          service: 'kidscan-backend',
        },
      });

      await this.s3Client.send(command);

      const url = `https://${this.s3Config.bucket}.s3.${this.s3Config.region}.amazonaws.com/${key}`;
      
      this.logger.log(`File uploaded successfully: ${key}`);
      
      return { url, key };

    } catch (error) {
      this.logger.error(`S3 upload failed for key ${key}:`, error);
      throw new InternalServerErrorException('Failed to upload file to storage');
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      if (!this.s3Config.accessKeyId || !this.s3Config.secretAccessKey) {
        this.logger.warn('AWS credentials not configured, skipping file deletion');
        return;
      }

      const command = new DeleteObjectCommand({
        Bucket: this.s3Config.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`File deleted successfully: ${key}`);

    } catch (error) {
      this.logger.error(`Failed to delete file ${key}:`, error);
      // Don't throw error for deletion failures - log and continue
    }
  }

  // Utility method to extract S3 key from URL
  extractKeyFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname.includes('s3') || urlObj.hostname.includes(this.s3Config.bucket)) {
        return urlObj.pathname.substring(1); // Remove leading slash
      }
      return null;
    } catch {
      return null;
    }
  }

  // Health check method
  async isConfigured(): Promise<boolean> {
    return !!(this.s3Config.accessKeyId && this.s3Config.secretAccessKey);
  }
}