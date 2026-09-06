import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { RunCodeSchema, type AuthenticatedUser, type RunCodeInput } from '@technical-platform/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { SubmissionsService } from './submissions.service.js';

@Controller()
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  // Attempt-scoped (not assessment-scoped) to match the existing draft-save route
  // shape (AttemptsController) — the frontend already has attemptId in hand on the
  // exam page and this avoids an extra assessmentId round trip per Run click.
  @Roles('STUDENT')
  @Post('attempts/:attemptId/questions/:questionId/run')
  @HttpCode(HttpStatus.ACCEPTED)
  runCode(
    @Param('attemptId') attemptId: string,
    @Param('questionId') questionId: string,
    @Body(new ZodValidationPipe(RunCodeSchema)) body: RunCodeInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.submissions.runCode(user.id, attemptId, questionId, body);
  }

  // Phase 7 — final judging against public + hidden test cases. Same body shape
  // as Run (language + code), same async accept-and-poll flow.
  @Roles('STUDENT')
  @Post('attempts/:attemptId/questions/:questionId/submit')
  @HttpCode(HttpStatus.ACCEPTED)
  submitCode(
    @Param('attemptId') attemptId: string,
    @Param('questionId') questionId: string,
    @Body(new ZodValidationPipe(RunCodeSchema)) body: RunCodeInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.submissions.submitCode(user.id, attemptId, questionId, body);
  }

  @Roles('STUDENT', 'ADMIN')
  @Get('submissions/:id')
  getSubmission(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.submissions.getSubmission(user, id);
  }

  // Phase 7 — safe submission history (both RUN and SUBMIT rows) for one
  // question within one attempt. Attempt-scoped for the same reason as run/submit.
  @Roles('STUDENT', 'ADMIN')
  @Get('attempts/:attemptId/questions/:questionId/submissions')
  getSubmissionHistory(
    @Param('attemptId') attemptId: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.submissions.getSubmissionHistory(user, attemptId, questionId);
  }
}
