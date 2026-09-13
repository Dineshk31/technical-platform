import { Module } from '@nestjs/common';
import { SubmissionsModule } from '../submissions/submissions.module.js';
import { PracticeController } from './practice.controller.js';
import { PracticeService } from './practice.service.js';

@Module({
  imports: [SubmissionsModule],
  controllers: [PracticeController],
  providers: [PracticeService],
})
export class PracticeModule {}
