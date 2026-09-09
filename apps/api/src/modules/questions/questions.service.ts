import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type {
  CreateCodingQuestionInput,
  CreateMcqQuestionInput,
  CreateTestCaseInput,
  ListQuestionsQueryInput,
  ReviewQuestionInput,
  UpdateCodingQuestionInput,
  UpdateMcqQuestionInput,
  UpdateTestCaseInput,
} from '@technical-platform/shared';
import { Prisma, type ProgrammingLanguage, type QuestionSource } from '../../../generated/prisma/index.js';
import { recomputeMaxMarks } from '../assessments/assessments.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toAdminQuestionDetail, toAdminQuestionListItem } from './dto/question.dto.js';
import { validateMcqForApproval } from './mcq-approval.util.js';

const DETAIL_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true } },
  codingQuestion: {
    include: { languages: true, testCases: true, referenceSolutions: true, starterTemplates: true },
  },
  mcqQuestion: { include: { options: true } },
  reviews: { include: { reviewedBy: { select: { id: true, name: true } } } },
  assessmentQuestions: { include: { section: { include: { assessment: { select: { id: true, title: true, status: true } } } } } },
  // Phase 10 review context: which generation request produced this question, if any
  // (source = AI_GENERATED). Deliberately excludes promptSnapshot/rawResponse — those
  // stay debug/audit-only, not part of the routine review view.
  aiGenerationRequest: { include: { requestedBy: { select: { id: true, name: true } } } },
} satisfies Prisma.QuestionInclude;

const LIST_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  codingQuestion: { include: { languages: true, testCases: { select: { isHidden: true } } } },
  mcqQuestion: { select: { mcqType: true, options: { select: { id: true } } } },
} satisfies Prisma.QuestionInclude;

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    adminId: string,
    input: CreateCodingQuestionInput,
    options?: { source?: QuestionSource; aiGenerationRequestId?: string },
  ) {
    const referenceSolutionEntries = Object.entries(input.referenceSolutions);
    const starterTemplateEntries = Object.entries(input.starterTemplates);

    const question = await this.prisma.question.create({
      data: {
        type: 'CODING',
        title: input.title,
        difficulty: input.difficulty,
        topics: input.topics,
        tags: input.tags,
        marks: input.marks,
        source: options?.source ?? 'MANUAL',
        aiGenerationRequestId: options?.aiGenerationRequestId,
        // Manually authored (and AI-generated) questions alike go through review
        // before they can be attached to an assessment (AssessmentsService.attachQuestion
        // requires APPROVED) — see docs/question-system.md §2/§4.
        approvalStatus: 'PENDING_REVIEW',
        createdById: adminId,
        codingQuestion: {
          create: {
            problemStatement: input.problemStatement,
            inputFormat: input.inputFormat,
            outputFormat: input.outputFormat,
            constraints: input.constraints,
            examples: input.examples,
            timeLimitSeconds: input.timeLimitSeconds,
            memoryLimitMb: input.memoryLimitMb,
            languages: { create: input.supportedLanguages.map((language) => ({ language })) },
            testCases: {
              create: [
                ...input.publicTestCases.map((tc, i) => ({
                  isHidden: false,
                  input: tc.input,
                  expectedOutput: tc.expectedOutput,
                  orderIndex: i,
                })),
                ...input.hiddenTestCases.map((tc, i) => ({
                  isHidden: true,
                  input: tc.input,
                  expectedOutput: tc.expectedOutput,
                  orderIndex: i,
                })),
              ],
            },
            referenceSolutions: {
              create: referenceSolutionEntries.map(([language, code]) => ({
                language: language as ProgrammingLanguage,
                code,
              })),
            },
            starterTemplates: {
              create: starterTemplateEntries.map(([language, code]) => ({
                language: language as ProgrammingLanguage,
                code,
              })),
            },
          },
        },
      },
      include: DETAIL_INCLUDE,
    });

    return toAdminQuestionDetail(question);
  }

  async list(query: ListQuestionsQueryInput) {
    const where: Prisma.QuestionWhereInput = {
      // Phase 11: the Question Bank lists both CODING and MCQ by default; `type` narrows
      // to one. (Phase 3-10 hardcoded `type: 'CODING'` here since MCQ didn't exist yet.)
      ...(query.type ? { type: query.type } : {}),
      ...(query.approvalStatus ? { approvalStatus: query.approvalStatus } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.topic ? { topics: { has: query.topic } } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(query.language ? { codingQuestion: { languages: { some: { language: query.language } } } } : {}),
      ...(query.source ? { source: query.source } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.question.count({ where }),
    ]);

    return {
      data: items.map(toAdminQuestionListItem),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  }

  async getDetail(id: string) {
    const question = await this.prisma.question.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!question) throw new NotFoundException('Question not found');
    return toAdminQuestionDetail(question);
  }

  async update(id: string, input: UpdateCodingQuestionInput) {
    await this.assertEditable(id);
    const existing = await this.prisma.question.findUnique({ where: { id }, include: { codingQuestion: true } });
    if (!existing || !existing.codingQuestion) throw new NotFoundException('Question not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id },
        data: {
          title: input.title,
          difficulty: input.difficulty,
          topics: input.topics,
          tags: input.tags,
          marks: input.marks,
        },
      });

      await tx.codingQuestion.update({
        where: { questionId: id },
        data: {
          problemStatement: input.problemStatement,
          inputFormat: input.inputFormat,
          outputFormat: input.outputFormat,
          constraints: input.constraints,
          examples: input.examples,
          timeLimitSeconds: input.timeLimitSeconds,
          memoryLimitMb: input.memoryLimitMb,
        },
      });

      if (input.supportedLanguages) {
        await tx.codingQuestionLanguage.deleteMany({ where: { questionId: id } });
        await tx.codingQuestionLanguage.createMany({
          data: input.supportedLanguages.map((language) => ({ questionId: id, language })),
        });
        await tx.codingReferenceSolution.deleteMany({
          where: { questionId: id, language: { notIn: input.supportedLanguages } },
        });
        await tx.codingStarterTemplate.deleteMany({
          where: { questionId: id, language: { notIn: input.supportedLanguages } },
        });
      }

      if (input.referenceSolutions) {
        for (const [language, code] of Object.entries(input.referenceSolutions)) {
          await tx.codingReferenceSolution.upsert({
            where: { questionId_language: { questionId: id, language: language as ProgrammingLanguage } },
            create: { questionId: id, language: language as ProgrammingLanguage, code },
            update: { code },
          });
        }
      }

      if (input.starterTemplates) {
        for (const [language, code] of Object.entries(input.starterTemplates)) {
          await tx.codingStarterTemplate.upsert({
            where: { questionId_language: { questionId: id, language: language as ProgrammingLanguage } },
            create: { questionId: id, language: language as ProgrammingLanguage, code },
            update: { code },
          });
        }
      }

      if (input.marks !== undefined) {
        await this.recomputeLinkedAssessments(tx, id);
      }
    });

    return this.getDetail(id);
  }

  // ============ MCQ ============

  async createMcq(adminId: string, input: CreateMcqQuestionInput) {
    const question = await this.prisma.question.create({
      data: {
        type: 'MCQ',
        title: input.title,
        difficulty: input.difficulty,
        topics: input.topics,
        tags: input.tags,
        marks: input.marks,
        source: 'MANUAL',
        approvalStatus: 'PENDING_REVIEW',
        createdById: adminId,
        mcqQuestion: {
          create: {
            mcqType: input.mcqType,
            questionText: input.questionText,
            codeSnippet: input.codeSnippet,
            explanation: input.explanation,
            negativeMarkingValue: input.negativeMarkingValue,
            options: {
              create: input.options.map((o, i) => ({ optionText: o.optionText, isCorrect: o.isCorrect, orderIndex: i })),
            },
          },
        },
      },
      include: DETAIL_INCLUDE,
    });

    return toAdminQuestionDetail(question);
  }

  async updateMcq(id: string, input: UpdateMcqQuestionInput) {
    await this.assertEditable(id);
    const existing = await this.prisma.question.findUnique({ where: { id }, include: { mcqQuestion: true } });
    if (!existing || !existing.mcqQuestion) throw new NotFoundException('Question not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id },
        data: {
          title: input.title,
          difficulty: input.difficulty,
          topics: input.topics,
          tags: input.tags,
          marks: input.marks,
        },
      });

      await tx.mcqQuestion.update({
        where: { questionId: id },
        data: {
          mcqType: input.mcqType,
          questionText: input.questionText,
          codeSnippet: input.codeSnippet,
          explanation: input.explanation,
          negativeMarkingValue: input.negativeMarkingValue,
        },
      });

      // Whole-array replace, same pattern as CodingQuestion's constraints/examples/topics
      // arrays — options is a small, bounded list (2-8), not worth a diff/upsert dance.
      if (input.options) {
        await tx.mcqOption.deleteMany({ where: { questionId: id } });
        await tx.mcqOption.createMany({
          data: input.options.map((o, i) => ({ questionId: id, optionText: o.optionText, isCorrect: o.isCorrect, orderIndex: i })),
        });
      }

      if (input.marks !== undefined) {
        await this.recomputeLinkedAssessments(tx, id);
      }
    });

    return this.getDetail(id);
  }

  async remove(id: string): Promise<void> {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) throw new NotFoundException('Question not found');

    const links = await this.prisma.assessmentQuestion.findMany({
      where: { questionId: id },
      include: { section: { include: { assessment: true } } },
    });
    const blocking = links.filter((l) => l.section.assessment.status !== 'DRAFT');
    if (blocking.length > 0) {
      throw new ConflictException('This question is used by a published assessment and cannot be deleted');
    }

    const draftAssessmentIds = [...new Set(links.map((l) => l.section.assessmentId))];

    await this.prisma.$transaction(async (tx) => {
      if (links.length > 0) {
        await tx.assessmentQuestion.deleteMany({ where: { questionId: id } });
        for (const assessmentId of draftAssessmentIds) {
          await recomputeMaxMarks(tx, assessmentId);
        }
      }
      await tx.question.delete({ where: { id } });
    });
  }

  async review(id: string, reviewerId: string, input: ReviewQuestionInput) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: {
        codingQuestion: { include: { testCases: true, referenceSolutions: true } },
        mcqQuestion: { include: { options: true } },
      },
    });
    if (!question || (!question.codingQuestion && !question.mcqQuestion)) {
      throw new NotFoundException('Question not found');
    }

    if (input.status === 'APPROVED') {
      const details: { field?: string; issue: string }[] =
        question.type === 'MCQ' ? validateMcqForApproval(question.mcqQuestion!) : validateCodingForApproval(question.codingQuestion!);
      if (details.length > 0) {
        throw new UnprocessableEntityException({
          error: { code: 'UNPROCESSABLE_ENTITY', message: 'Question is not ready to be approved', details },
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // Guard against two admins reviewing the same question concurrently — only apply
      // this decision if the question is still in the state this reviewer saw it in,
      // rather than silently clobbering a review that already landed.
      const { count } = await tx.question.updateMany({
        where: { id, approvalStatus: question.approvalStatus },
        data: { approvalStatus: input.status },
      });
      if (count === 0) {
        throw new ConflictException('This question was already reviewed by someone else — refresh and try again');
      }
      await tx.questionReview.create({
        data: { questionId: id, reviewedById: reviewerId, status: input.status, reviewNotes: input.notes },
      });
    });

    return this.getDetail(id);
  }

  // ============ Test cases ============

  async addTestCase(questionId: string, input: CreateTestCaseInput) {
    await this.assertEditable(questionId);
    const cq = await this.prisma.codingQuestion.findUnique({ where: { questionId } });
    if (!cq) throw new NotFoundException('Question not found');

    const orderIndex =
      input.orderIndex ?? (await this.prisma.codingTestCase.count({ where: { questionId, isHidden: input.isHidden } }));

    await this.prisma.codingTestCase.create({
      data: { questionId, isHidden: input.isHidden, input: input.input, expectedOutput: input.expectedOutput, orderIndex },
    });
    return this.getDetail(questionId);
  }

  async updateTestCase(questionId: string, testCaseId: string, input: UpdateTestCaseInput) {
    await this.assertEditable(questionId);
    const testCase = await this.prisma.codingTestCase.findFirst({ where: { id: testCaseId, questionId } });
    if (!testCase) throw new NotFoundException('Test case not found');

    await this.prisma.codingTestCase.update({
      where: { id: testCaseId },
      data: {
        isHidden: input.isHidden,
        input: input.input,
        expectedOutput: input.expectedOutput,
        orderIndex: input.orderIndex,
      },
    });
    return this.getDetail(questionId);
  }

  async removeTestCase(questionId: string, testCaseId: string): Promise<void> {
    await this.assertEditable(questionId);
    const testCase = await this.prisma.codingTestCase.findFirst({ where: { id: testCaseId, questionId } });
    if (!testCase) throw new NotFoundException('Test case not found');
    await this.prisma.codingTestCase.delete({ where: { id: testCaseId } });
  }

  // ============ shared helpers ============

  /** Docs/question-system.md §6: freely editable while every assessment referencing
   * this question is still DRAFT; blocked once any reference has gone live. */
  private async assertEditable(questionId: string): Promise<void> {
    const blocking = await this.prisma.assessmentQuestion.findFirst({
      where: { questionId, section: { assessment: { status: { not: 'DRAFT' } } } },
    });
    if (blocking) {
      throw new ConflictException('This question is used by a published assessment and can no longer be edited');
    }
  }

  private async recomputeLinkedAssessments(tx: Prisma.TransactionClient, questionId: string): Promise<void> {
    const links = await tx.assessmentQuestion.findMany({
      where: { questionId },
      select: { section: { select: { assessmentId: true } } },
    });
    const assessmentIds = [...new Set(links.map((l) => l.section.assessmentId))];
    for (const assessmentId of assessmentIds) {
      await recomputeMaxMarks(tx, assessmentId);
    }
  }
}

type CodingApprovalCheckSource = Prisma.CodingQuestionGetPayload<{ include: { testCases: true; referenceSolutions: true } }>;

/** docs/question-system.md §2 — ≥1 public + ≥1 hidden test case, ≥1 reference solution. */
function validateCodingForApproval(cq: CodingApprovalCheckSource): { field?: string; issue: string }[] {
  const details: { field?: string; issue: string }[] = [];
  if (!cq.testCases.some((tc) => !tc.isHidden)) {
    details.push({ field: 'publicTestCases', issue: 'at least one public test case is required to approve' });
  }
  if (!cq.testCases.some((tc) => tc.isHidden)) {
    details.push({ field: 'hiddenTestCases', issue: 'at least one hidden test case is required to approve' });
  }
  if (cq.referenceSolutions.length === 0) {
    details.push({ field: 'referenceSolutions', issue: 'at least one reference solution is required to approve' });
  }
  return details;
}
