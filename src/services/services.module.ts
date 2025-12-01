import { Module } from '@nestjs/common';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';
import { BillingModule } from '../billing/billing.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [BillingModule, DatabaseModule],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}