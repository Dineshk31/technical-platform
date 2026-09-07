import { BadGatewayException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIGeneratedCodingQuestionSchema,
  type AIGeneratedCodingQuestion,
  type AIProvider,
  type CreateCodingQuestionInput,
  type FailedGenerationItem,
  type GenerateCodingQuestionsInput,
} from '@technical-platform/shared';
import type { AiGenerationRequest, Prisma } from '../../../generated/prisma/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QuestionsService } from '../questions/questions.service.js';
import { AI_PROVIDER } from './ai-provider.token.js';

export interface GenerationPreview {
  requestId: string;
  status: string;
  topic: string;
  difficulty: string;
  language: string | null;
  countRequested: number;
  generated: AIGeneratedCodingQuestion[];
  failed: FailedGenerationItem[];
  errorMessage: string | null;
  createdAt: Date;
}

interface StoredGenerationPayload {
  drafts: AIGeneratedCodingQuestion[];
  failed: FailedGenerationItem[];
  rawText?: string;
}

/**
 * Application-level orchestrator (docs/ai-integration.md §3, §8). Contains
 * zero Gemini-specific code — it only knows the `AIProvider` interface — and
 * enforces the workflow that keeps AI output from ever becoming a live
 * question without review: validate request → call provider → re-validate
 * every candidate → persist an audit row → return a PREVIEW. Nothing is
 * written to `questions` here; that only happens in `saveGenerated`, in
 * direct response to an explicit admin action (docs' Part 10 requirement).
 */
@Injectable()
export class QuestionGenerationService {
  private readonly logger = new Logger(QuestionGenerationService.name);

  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AIProvider,
    private readonly prisma: PrismaService,
    private readonly questions: QuestionsService,
    private readonly config: ConfigService,
  ) {}

  async generate(adminId: string, input: GenerateCodingQuestionsInput): Promise<GenerationPreview> {
    // Checked before rate limiting on purpose: a deduped request never calls the
    // provider, so it should never be throttled by the provider-call rate limit below.
    const duplicate = await this.findRecentDuplicate(adminId, input);
    if (duplicate) {
      this.logger.log(`Returning cached generation result for admin ${adminId} (duplicate request within dedupe window)`);
      return this.toPreview(duplicate);
    }

    await this.assertNotRateLimited(adminId);

    const result = await this.provider.generateCodingQuestions({
      topic: input.topic,
      difficulty: input.difficulty,
      language: input.language,
      count: input.count,
      concepts: input.concepts,
      additionalInstructions: input.additionalInstructions,
      marks: input.marks,
      timeLimitSeconds: input.timeLimitSeconds,
      memoryLimitMb: input.memoryLimitMb,
    });

    if (!result.success) {
      await this.prisma.aiGenerationRequest.create({
        data: this.baseRequestData(adminId, input, result.promptSnapshot, {
          status: 'FAILED',
          errorMessage: result.error?.message ?? 'AI generation failed',
          completedAt: new Date(),
        }),
      });
      throw new BadGatewayException({
        error: { code: result.error?.code ?? 'AI_GENERATION_FAILED', message: result.error?.message ?? 'AI generation failed' },
      });
    }

    const { drafts, failed } = this.validateCandidates(result.data ?? []);
    const payload: StoredGenerationPayload = { drafts, failed, rawText: result.rawResponseText };

    const row = await this.prisma.aiGenerationRequest.create({
      data: this.baseRequestData(adminId, input, result.promptSnapshot, {
        status: drafts.length > 0 ? 'SUCCESS' : 'FAILED',
        errorMessage: drafts.length > 0 ? null : 'Every generated question failed validation — see the failed[] details',
        rawResponse: payload as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
      }),
    });

    return this.toPreview(row);
  }

  async getRequest(requestId: string): Promise<GenerationPreview> {
    const row = await this.prisma.aiGenerationRequest.findUnique({ where: { id: requestId } });
    if (!row) throw new NotFoundException('Generation request not found');
    return this.toPreview(row);
  }

  /**
   * The only place AI-generated content is ever written to the question bank
   * — always in direct response to this explicit call, never automatically
   * (docs Part 10). Reuses `QuestionsService.create` so an AI-generated
   * question is validated and stored by the exact same code path as a
   * manually authored one; the only difference is `source`/`aiGenerationRequestId`.
   */
  async saveGenerated(adminId: string, requestId: string, selected: CreateCodingQuestionInput[]) {
    const row = await this.prisma.aiGenerationRequest.findUnique({ where: { id: requestId } });
    if (!row) throw new NotFoundException('Generation request not found');

    const created: string[] = [];
    for (const draft of selected) {
      const saved = await this.questions.create(adminId, draft, { source: 'AI_GENERATED', aiGenerationRequestId: requestId });
      created.push(saved.id);
    }
    return { requestId, created };
  }

  private validateCandidates(candidates: unknown[]): { drafts: AIGeneratedCodingQuestion[]; failed: FailedGenerationItem[] } {
    const drafts: AIGeneratedCodingQuestion[] = [];
    const failed: FailedGenerationItem[] = [];
    candidates.forEach((candidate, index) => {
      const result = AIGeneratedCodingQuestionSchema.safeParse(candidate);
      if (result.success) {
        drafts.push(result.data);
      } else {
        failed.push({ index, issues: result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`) });
      }
    });
    return { drafts, failed };
  }

  /** Per docs/ai-integration.md §6 — identical repeat request by the same admin within
   * 60s returns the prior result instead of calling Gemini again (accidental double-submit
   * guard, not a general cache). */
  private async findRecentDuplicate(adminId: string, input: GenerateCodingQuestionsInput) {
    return this.prisma.aiGenerationRequest.findFirst({
      where: {
        requestedById: adminId,
        topic: input.topic,
        difficulty: input.difficulty,
        countRequested: input.count,
        languageHint: input.language,
        status: { not: 'FAILED' },
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Same hand-rolled pattern as SubmissionsService.assertNotRateLimited — per docs/security.md §7. */
  private async assertNotRateLimited(adminId: string): Promise<void> {
    const rateLimitMs = this.config.get<number>('AI_GENERATION_RATE_LIMIT_MS') ?? 3000;
    const last = await this.prisma.aiGenerationRequest.findFirst({
      where: { requestedById: adminId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (last && Date.now() - last.createdAt.getTime() < rateLimitMs) {
      throw new HttpException(
        { error: { code: 'RATE_LIMITED', message: 'Please wait a moment before generating again' } },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private baseRequestData(
    adminId: string,
    input: GenerateCodingQuestionsInput,
    promptSnapshot: string,
    extra: Partial<Prisma.AiGenerationRequestUncheckedCreateInput>,
  ): Prisma.AiGenerationRequestUncheckedCreateInput {
    return {
      requestedById: adminId,
      sectionType: 'CODING',
      topic: input.topic,
      difficulty: input.difficulty,
      countRequested: input.count,
      languageHint: input.language,
      marksHint: input.marks,
      timeLimitHint: input.timeLimitSeconds,
      memoryLimitHint: input.memoryLimitMb,
      promptSnapshot,
      status: 'PENDING',
      ...extra,
    };
  }

  private toPreview(row: AiGenerationRequest): GenerationPreview {
    const raw = (row.rawResponse ?? {}) as Partial<StoredGenerationPayload>;
    return {
      requestId: row.id,
      status: row.status,
      topic: row.topic,
      difficulty: row.difficulty,
      language: row.languageHint,
      countRequested: row.countRequested,
      generated: raw.drafts ?? [],
      failed: raw.failed ?? [],
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
    };
  }
}
