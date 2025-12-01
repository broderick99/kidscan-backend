import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { ServicesModule } from '../services/services.module';
import { UploadModule } from '../upload/upload.module';
import { BillingModule } from '../billing/billing.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [ServicesModule, UploadModule, BillingModule, DatabaseModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}