import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import {
  PracticeQuestionQuerySchema,
  PracticeSubmissionsQuerySchema,
  RunCodeSchema,
  SaveCodeDraftSchema,
  type AuthenticatedUser,
  type PracticeQuestionQueryInput,
  type PracticeSubmissionsQueryInput,
  type RunCodeInput,
  type SaveCodeDraftInput,
} from '@technical-platform/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { SubmissionsService } from '../submissions/submissions.service.js';
import { PracticeService } from './practice.service.js';

// Every route here is STUDENT-only, same deny-by-default posture as QuestionsController
// being ADMIN-only (docs/security.md §2) — Practice Mode is a student-facing surface;
// admins still manage/review the underlying question bank through QuestionsController,
// nothing about that changes here. Run/Submit/submission-history delegate straight to
// SubmissionsService's practice-specific methods rather than duplicating the execution
// pipeline (rate limiting, execution-job creation, notify) — see submissions.service.ts.
@Controller('practice')
export class PracticeController {
  constructor(
    private readonly practice: PracticeService,
    private readonly submissions: SubmissionsService,
  ) {}

  @Roles('STUDENT')
  @Get('questions')
  listQuestions(
    @Query(new ZodValidationPipe(PracticeQuestionQuerySchema)) query: PracticeQuestionQueryInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.practice.listQuestions(user.id, query);
  }

  @Roles('STUDENT')
  @Get('progress')
  getProgress(@CurrentUser() user: AuthenticatedUser) {
    return this.practice.getProgress(user.id);
  }

  @Roles('STUDENT')
  @Get('questions/:id')
  getQuestion(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.practice.getQuestionDetail(user.id, id);
  }

  @Roles('STUDENT')
  @Put('questions/:id/draft')
  saveDraft(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SaveCodeDraftSchema)) body: SaveCodeDraftInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.practice.saveDraft(user.id, id, body);
  }

  @Roles('STUDENT')
  @Post('questions/:id/run')
  @HttpCode(HttpStatus.ACCEPTED)
  runCode(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RunCodeSchema)) body: RunCodeInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.submissions.runPracticeCode(user.id, id, body);
  }

  @Roles('STUDENT')
  @Post('questions/:id/submit')
  @HttpCode(HttpStatus.ACCEPTED)
  submitCode(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RunCodeSchema)) body: RunCodeInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.submissions.submitPracticeCode(user.id, id, body);
  }

  // GET /submissions/:id (SubmissionsController) already serves both attempt-owned
  // and practice-owned submissions — no separate practice detail route needed.
  @Roles('STUDENT')
  @Get('questions/:id/submissions')
  getSubmissionHistory(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(PracticeSubmissionsQuerySchema)) query: PracticeSubmissionsQueryInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.submissions.getPracticeSubmissionHistory(user, id, query);
  }
}
