import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  GenerateCodingQuestionsSchema,
  SaveGeneratedQuestionsSchema,
  type AuthenticatedUser,
  type GenerateCodingQuestionsInput,
  type SaveGeneratedQuestionsInput,
} from '@technical-platform/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { QuestionGenerationService } from './ai.service.js';

// ADMIN-only, enforced server-side by the global RolesGuard (docs/security.md §3) —
// there is no code path here a STUDENT-role request can reach, regardless of what
// the frontend does or doesn't render. See docs/api-specification.md §5.
@Controller('ai/questions')
export class AiController {
  constructor(private readonly generation: QuestionGenerationService) {}

  @Roles('ADMIN')
  @Post('generate')
  generate(
    @Body(new ZodValidationPipe(GenerateCodingQuestionsSchema)) body: GenerateCodingQuestionsInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.generation.generate(user.id, body);
  }

  @Roles('ADMIN')
  @Get('requests/:id')
  getRequest(@Param('id') id: string) {
    return this.generation.getRequest(id);
  }

  @Roles('ADMIN')
  @Post('requests/:id/save')
  save(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SaveGeneratedQuestionsSchema)) body: SaveGeneratedQuestionsInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.generation.saveGenerated(user.id, id, body.questions);
  }
}
