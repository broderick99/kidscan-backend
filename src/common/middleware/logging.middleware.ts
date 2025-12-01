import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, body } = req;
    const startTime = Date.now();

    console.log(`📥 ${method} ${originalUrl}`);
    if (Object.keys(body).length > 0) {
      console.log('Body:', JSON.stringify(body, null, 2));
    }

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;
      console.log(`📤 ${method} ${originalUrl} ${statusCode} - ${duration}ms`);
    });

    next();
  }
}