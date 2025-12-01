export interface UploadResult {
  url: string;
  key: string;
  bucket: string;
  originalName: string;
  size: number;
  mimeType: string;
}

export interface ProcessedImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

export interface FileUploadConfig {
  maxFileSize: number;
  allowedMimeTypes: string[];
  processingOptions: ProcessedImageOptions;
}

export interface S3Config {
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}