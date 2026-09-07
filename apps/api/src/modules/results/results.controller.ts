import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListResultsQuerySchema, type AuthenticatedUser, type ListResultsQueryInput } from '@technical-platform/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ResultsService } from './results.service.js';

// Shares the `assessments` path prefix with AssessmentsController (a separate
// controller class, same base path — legal in Nest as long as method+path
// combinations don't collide, and none do here: `result`/`results` are
// literal segments no other controller registers).
@Controller('assessments')
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Roles('STUDENT')
  @Get(':id/result')
  getStudentResult(@Param('id') assessmentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.results.getStudentResult(user, assessmentId);
  }

  @Roles('ADMIN')
  @Get(':id/results')
  listResults(
    @Param('id') assessmentId: string,
    @Query(new ZodValidationPipe(ListResultsQuerySchema)) query: ListResultsQueryInput,
  ) {
    return this.results.listResults(assessmentId, query);
  }

  @Roles('ADMIN')
  @Get(':id/results/:attemptId')
  getAdminResultDetail(@Param('id') assessmentId: string, @Param('attemptId') attemptId: string) {
    return this.results.getAdminResultDetail(assessmentId, attemptId);
  }
}
