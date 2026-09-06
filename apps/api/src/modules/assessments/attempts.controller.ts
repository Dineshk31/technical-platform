import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import {
  SaveCodeDraftSchema,
  type AuthenticatedUser,
  type SaveCodeDraftInput,
} from '@technical-platform/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AssessmentsService } from './assessments.service.js';

// Backs the attempt-centric frontend route /student/attempts/:attemptId, which doesn't
// necessarily have the assessmentId on hand — this resolves attempt -> assessment, and
// hosts the Phase 5 code-draft persistence endpoints (also attempt-scoped).
@Controller('attempts')
export class AttemptsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Roles('STUDENT')
  @Get(':id')
  getOne(@Param('id') attemptId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assessments.getAttemptDetail(user.id, attemptId);
  }

  @Roles('STUDENT')
  @Get(':id/drafts')
  getDrafts(@Param('id') attemptId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assessments.getAttemptDrafts(user.id, attemptId);
  }

  @Roles('STUDENT')
  @Put(':id/questions/:questionId/draft')
  saveDraft(
    @Param('id') attemptId: string,
    @Param('questionId') questionId: string,
    @Body(new ZodValidationPipe(SaveCodeDraftSchema)) body: SaveCodeDraftInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessments.saveAttemptDraft(user.id, attemptId, questionId, body);
  }
}
