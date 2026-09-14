import { Module } from '@nestjs/common';
import { LearnController } from './learn.controller.js';
import { LearnService } from './learn.service.js';
import { LessonsController } from './lessons.controller.js';
import { LessonsService } from './lessons.service.js';

@Module({
  controllers: [LessonsController, LearnController],
  providers: [LessonsService, LearnService],
})
export class LearnModule {}
