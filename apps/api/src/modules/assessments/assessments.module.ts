import { Module } from '@nestjs/common';
import { AssessmentsController } from './assessments.controller.js';
import { AttemptsController } from './attempts.controller.js';
import { AssessmentsService } from './assessments.service.js';

@Module({
  controllers: [AssessmentsController, AttemptsController],
  providers: [AssessmentsService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
