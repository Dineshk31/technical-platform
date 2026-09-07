import { Module } from '@nestjs/common';
import { ExpirySweepService } from './expiry-sweep.service.js';
import { ResultsController } from './results.controller.js';
import { ResultsService } from './results.service.js';

@Module({
  controllers: [ResultsController],
  providers: [ResultsService, ExpirySweepService],
  exports: [ResultsService],
})
export class ResultsModule {}
