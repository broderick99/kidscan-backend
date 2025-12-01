import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';

@Module({
  imports: [
    MulterModule.register({
      // Configure multer for memory storage (we'll process and upload to S3)
      storage: undefined, // Use default memory storage
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 1,
      },
      fileFilter: (req, file, callback) => {
        if (file.mimetype.match(/^image\/(jpeg|jpg|png|webp)$/)) {
          callback(null, true);
        } else {
          callback(new Error('Only image files are allowed'), false);
        }
      },
    }),
  ],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService], // Export for use in other modules
})
export class UploadModule {}