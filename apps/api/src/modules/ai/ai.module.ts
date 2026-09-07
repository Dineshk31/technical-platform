import { Module } from '@nestjs/common';
import { QuestionsModule } from '../questions/questions.module.js';
import { AI_PROVIDER } from './ai-provider.token.js';
import { AiController } from './ai.controller.js';
import { QuestionGenerationService } from './ai.service.js';
import { GeminiProvider } from './providers/gemini.provider.js';

@Module({
  imports: [QuestionsModule],
  controllers: [AiController],
  providers: [
    QuestionGenerationService,
    // The one binding a future provider swap changes — see docs/ai-integration.md §2.
    { provide: AI_PROVIDER, useClass: GeminiProvider },
  ],
})
export class AiModule {}
