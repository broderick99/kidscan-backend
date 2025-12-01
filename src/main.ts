import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  
  // Enable CORS
  const allowedOrigins = [
    'http://localhost:3000', 
    'http://localhost:5173',
    'https://joinkidscan.com',
    'https://www.joinkidscan.com'
  ];
  
  // Add FRONTEND_URL from environment if it exists
  const frontendUrl = configService.get('FRONTEND_URL');
  if (frontendUrl && !allowedOrigins.includes(frontendUrl)) {
    allowedOrigins.push(frontendUrl);
  }
  
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // API prefix
  const apiPrefix = configService.get('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(apiPrefix);

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Kids Can API')
    .setDescription('The Kids Can API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = configService.get('PORT', 8080);
  await app.listen(port);
  console.log(`🚀 API listening on port ${port}`);
  console.log(`📚 Swagger docs available at http://localhost:${port}/docs`);
}
bootstrap();