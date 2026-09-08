import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  AssignParticipantsSchema,
  AttachQuestionSchema,
  CreateAssessmentSchema,
  CreateSectionSchema,
  ListAssessmentsQuerySchema,
  ListAssignedAssessmentsQuerySchema,
  SaveMcqAnswerSchema,
  UpdateAssessmentQuestionSchema,
  UpdateAssessmentSchema,
  UpdateSectionSchema,
  type AssignParticipantsInput,
  type AttachQuestionInput,
  type AuthenticatedUser,
  type CreateAssessmentInput,
  type CreateSectionInput,
  type ListAssessmentsQueryInput,
  type ListAssignedAssessmentsQueryInput,
  type SaveMcqAnswerInput,
  type UpdateAssessmentInput,
  type UpdateAssessmentQuestionInput,
  type UpdateSectionInput,
} from '@technical-platform/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AssessmentsService } from './assessments.service.js';

// NOTE: pipes are attached directly to the parameter they validate
// (`@Body(new ZodValidationPipe(...))`), never via a method-level `@UsePipes()`.
// `@UsePipes()` applies to *every* resolved parameter on the handler — including
// `@CurrentUser()` and `@Param()` — so a method-level Zod pipe here would also
// run the current-user object or a route param string through the body schema
// and fail. Scoping the pipe to its own parameter avoids that entirely.

@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body(new ZodValidationPipe(CreateAssessmentSchema)) body: CreateAssessmentInput, @CurrentUser() user: AuthenticatedUser) {
    return this.assessments.create(user.id, body);
  }

  @Roles('ADMIN')
  @Get()
  list(@Query(new ZodValidationPipe(ListAssessmentsQuerySchema)) query: ListAssessmentsQueryInput) {
    return this.assessments.list(query);
  }

  // Must be declared before GET /:id so "assigned" isn't swallowed as an :id.
  @Roles('STUDENT')
  @Get('assigned')
  listAssigned(
    @Query(new ZodValidationPipe(ListAssignedAssessmentsQuerySchema)) query: ListAssignedAssessmentsQueryInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessments.listAssigned(user.id, query);
  }

  @Roles('ADMIN', 'STUDENT')
  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return user.role === 'ADMIN'
      ? this.assessments.getAdminDetail(id)
      : this.assessments.getStudentDetail(user.id, id);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateAssessmentSchema)) body: UpdateAssessmentInput) {
    return this.assessments.update(id, body);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.assessments.remove(id);
  }

  @Roles('ADMIN')
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(@Param('id') id: string) {
    return this.assessments.publish(id);
  }

  @Roles('ADMIN')
  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  unpublish(@Param('id') id: string) {
    return this.assessments.unpublish(id);
  }

  @Roles('ADMIN')
  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(@Param('id') id: string) {
    return this.assessments.archive(id);
  }

  @Roles('ADMIN')
  @Post(':id/sections')
  addSection(@Param('id') assessmentId: string, @Body(new ZodValidationPipe(CreateSectionSchema)) body: CreateSectionInput) {
    return this.assessments.addSection(assessmentId, body);
  }

  @Roles('ADMIN')
  @Patch(':id/sections/:sectionId')
  updateSection(
    @Param('id') assessmentId: string,
    @Param('sectionId') sectionId: string,
    @Body(new ZodValidationPipe(UpdateSectionSchema)) body: UpdateSectionInput,
  ) {
    return this.assessments.updateSection(assessmentId, sectionId, body);
  }

  @Roles('ADMIN')
  @Delete(':id/sections/:sectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeSection(@Param('id') assessmentId: string, @Param('sectionId') sectionId: string) {
    return this.assessments.removeSection(assessmentId, sectionId);
  }

  @Roles('ADMIN')
  @Post(':id/sections/:sectionId/questions')
  attachQuestion(
    @Param('id') assessmentId: string,
    @Param('sectionId') sectionId: string,
    @Body(new ZodValidationPipe(AttachQuestionSchema)) body: AttachQuestionInput,
  ) {
    return this.assessments.attachQuestion(assessmentId, sectionId, body);
  }

  @Roles('ADMIN')
  @Patch(':id/sections/:sectionId/questions/:aqId')
  updateAssessmentQuestion(
    @Param('id') assessmentId: string,
    @Param('sectionId') sectionId: string,
    @Param('aqId') aqId: string,
    @Body(new ZodValidationPipe(UpdateAssessmentQuestionSchema)) body: UpdateAssessmentQuestionInput,
  ) {
    return this.assessments.updateAssessmentQuestion(assessmentId, sectionId, aqId, body);
  }

  @Roles('ADMIN')
  @Delete(':id/sections/:sectionId/questions/:aqId')
  @HttpCode(HttpStatus.NO_CONTENT)
  detachQuestion(
    @Param('id') assessmentId: string,
    @Param('sectionId') sectionId: string,
    @Param('aqId') aqId: string,
  ) {
    return this.assessments.detachQuestion(assessmentId, sectionId, aqId);
  }

  @Roles('ADMIN')
  @Post(':id/participants')
  assignParticipants(
    @Param('id') assessmentId: string,
    @Body(new ZodValidationPipe(AssignParticipantsSchema)) body: AssignParticipantsInput,
  ) {
    return this.assessments.assignParticipants(assessmentId, body);
  }

  @Roles('ADMIN')
  @Delete(':id/participants/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  unassignParticipant(@Param('id') assessmentId: string, @Param('userId') userId: string) {
    return this.assessments.unassignParticipant(assessmentId, userId);
  }

  @Roles('STUDENT')
  @Post(':id/start')
  startAttempt(@Param('id') assessmentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assessments.startAttempt(assessmentId, user.id);
  }

  @Roles('STUDENT')
  @Get(':id/status')
  getStatus(@Param('id') assessmentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assessments.getAttemptStatus(user.id, assessmentId);
  }

  @Roles('STUDENT')
  @Get(':id/questions')
  getStudentQuestions(@Param('id') assessmentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assessments.getStudentQuestions(user.id, assessmentId);
  }

  @Roles('STUDENT')
  @Post(':id/mcq/:questionId/answer')
  saveMcqAnswer(
    @Param('id') assessmentId: string,
    @Param('questionId') questionId: string,
    @Body(new ZodValidationPipe(SaveMcqAnswerSchema)) body: SaveMcqAnswerInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessments.saveAttemptMcqAnswer(user.id, assessmentId, questionId, body);
  }

  @Roles('STUDENT')
  @Post(':id/submit')
  submitAttempt(@Param('id') assessmentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assessments.submitAttempt(user.id, assessmentId);
  }
}
