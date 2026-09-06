import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateCodingQuestionSchema,
  CreateTestCaseSchema,
  ListQuestionsQuerySchema,
  ReviewQuestionSchema,
  UpdateCodingQuestionSchema,
  UpdateTestCaseSchema,
  type AuthenticatedUser,
  type CreateCodingQuestionInput,
  type CreateTestCaseInput,
  type ListQuestionsQueryInput,
  type ReviewQuestionInput,
  type UpdateCodingQuestionInput,
  type UpdateTestCaseInput,
} from '@technical-platform/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { QuestionsService } from './questions.service.js';

// Every route in this controller is ADMIN-only (see docs/security.md §1: "Student
// escalates to admin-only endpoints" is mitigated by deny-by-default RolesGuard).
// There is intentionally no student-facing route here at all in Phase 3 — a student
// can never reach hidden test cases or reference solutions because no code path
// exists for them to do so, not because a filter happens to hide it.
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Roles('ADMIN')
  @Post('coding')
  create(@Body(new ZodValidationPipe(CreateCodingQuestionSchema)) body: CreateCodingQuestionInput, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.create(user.id, body);
  }

  @Roles('ADMIN')
  @Get()
  list(@Query(new ZodValidationPipe(ListQuestionsQuerySchema)) query: ListQuestionsQueryInput) {
    return this.questions.list(query);
  }

  @Roles('ADMIN')
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.questions.getDetail(id);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateCodingQuestionSchema)) body: UpdateCodingQuestionInput) {
    return this.questions.update(id, body);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.questions.remove(id);
  }

  @Roles('ADMIN')
  @Post(':id/review')
  review(@Param('id') id: string, @Body(new ZodValidationPipe(ReviewQuestionSchema)) body: ReviewQuestionInput, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.review(id, user.id, body);
  }

  @Roles('ADMIN')
  @Post(':id/test-cases')
  addTestCase(@Param('id') questionId: string, @Body(new ZodValidationPipe(CreateTestCaseSchema)) body: CreateTestCaseInput) {
    return this.questions.addTestCase(questionId, body);
  }

  @Roles('ADMIN')
  @Patch(':id/test-cases/:testCaseId')
  updateTestCase(
    @Param('id') questionId: string,
    @Param('testCaseId') testCaseId: string,
    @Body(new ZodValidationPipe(UpdateTestCaseSchema)) body: UpdateTestCaseInput,
  ) {
    return this.questions.updateTestCase(questionId, testCaseId, body);
  }

  @Roles('ADMIN')
  @Delete(':id/test-cases/:testCaseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTestCase(@Param('id') questionId: string, @Param('testCaseId') testCaseId: string) {
    return this.questions.removeTestCase(questionId, testCaseId);
  }
}
