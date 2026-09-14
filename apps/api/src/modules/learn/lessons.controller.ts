import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateLessonSchema,
  ListLessonsQuerySchema,
  UpdateLessonSchema,
  type AuthenticatedUser,
  type CreateLessonInput,
  type ListLessonsQueryInput,
  type UpdateLessonInput,
} from '@technical-platform/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { LessonsService } from './lessons.service.js';

// ADMIN-only content authoring, same deny-by-default posture as QuestionsController —
// a student can never reach an unpublished lesson through this controller because no
// route here is reachable by a STUDENT role at all (see LearnController for the
// separate, published-only student-facing surface).
@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessons: LessonsService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body(new ZodValidationPipe(CreateLessonSchema)) body: CreateLessonInput, @CurrentUser() user: AuthenticatedUser) {
    return this.lessons.create(user.id, body);
  }

  @Roles('ADMIN')
  @Get()
  list(@Query(new ZodValidationPipe(ListLessonsQuerySchema)) query: ListLessonsQueryInput) {
    return this.lessons.list(query);
  }

  @Roles('ADMIN')
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.lessons.getDetail(id);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateLessonSchema)) body: UpdateLessonInput) {
    return this.lessons.update(id, body);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.lessons.remove(id);
  }
}
