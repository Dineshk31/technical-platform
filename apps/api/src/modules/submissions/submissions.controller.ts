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

  @Roles('STUDENT', 'ADMIN')
  @Get('submissions/:id')
  getSubmission(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.submissions.getSubmission(user, id);
  }
}
