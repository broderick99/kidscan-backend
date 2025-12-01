import { Module } from '@nestjs/common';
import { HomesController } from './homes.controller';
import { HomesService } from './homes.service';

@Module({
  controllers: [HomesController],
  providers: [HomesService],
  exports: [HomesService],
})
export class HomesModule {}