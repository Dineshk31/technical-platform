import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '@technical-platform/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { LearnService } from './learn.service.js';

// STUDENT-only read + progress surface, same role split as PracticeController
// vs QuestionsController — admins author content through LessonsController,
// students only ever reach published lessons through this one.
@Controller('learn')
export class LearnController {
  constructor(private readonly learn: LearnService) {}

  @Roles('STUDENT')
  @Get('progress')
  getProgress(@CurrentUser() user: AuthenticatedUser) {
    return this.learn.getProgress(user.id);
  }

  @Roles('STUDENT')
  @Get('topics/:topic/lessons')
  listTopicLessons(@Param('topic') topic: string, @CurrentUser() user: AuthenticatedUser) {
    return this.learn.listTopicLessons(user.id, topic);
  }

  @Roles('STUDENT')
  @Get('lessons/:id')
  getLesson(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.learn.getLesson(user.id, id);
  }

  @Roles('STUDENT')
  @Post('lessons/:id/complete')
  @HttpCode(HttpStatus.OK)
  completeLesson(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.learn.completeLesson(user.id, id);
  }
}
