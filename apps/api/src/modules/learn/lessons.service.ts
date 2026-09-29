import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { CreateLessonInput, ListLessonsQueryInput, UpdateLessonInput } from '@technical-platform/shared';
import type { Prisma } from '../../../generated/prisma/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { questionVerificationStatus, solutionVerificationStatus } from '../questions/verification.util.js';
import { toAdminLessonDetail, toAdminLessonListItem } from './dto/lesson.dto.js';

const LINK_INCLUDE = {
  questionLinks: {
    include: {
      question: {
        select: {
          id: true,
          title: true,
          type: true,
          difficulty: true,
          topics: true,
          approvalStatus: true,
          codingQuestion: { select: { referenceSolutions: { select: { verificationSubmission: { select: { status: true } } } } } },
        },
      },
    },
  },
} satisfies Prisma.LessonInclude;

type LinkIssue = { field: 'checkQuestionIds' | 'practiceQuestionIds'; issue: string };

/**
 * Admin authoring — create/list/get/update/delete. Mirrors QuestionsService's
 * shape (list narrow, detail full, update partial) and AssessmentsService's
 * `orderIndex ?? count(where: parent)` append-at-end default for new content
 * (see docs/PHASE_16_LEARN_ARCHITECTURE_AUDIT.md §6).
 *
 * Phase 18: lessons also carry learning objectives and deliberately attached
 * questions — approved MCQs as knowledge checks, approved + *verified* coding problems
 * as practice. Those rules are enforced here on every save, and re-checked when a
 * lesson is published so a link that has since gone stale can't go live.
 */
@Injectable()
export class LessonsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(adminId: string, input: CreateLessonInput) {
    const checkIds = input.checkQuestionIds ?? [];
    const practiceIds = input.practiceQuestionIds ?? [];
    await this.assertLinksValid(checkIds, practiceIds);

    const orderIndex = input.orderIndex ?? (await this.prisma.lesson.count({ where: { topic: input.topic } }));
    const lesson = await this.prisma.lesson.create({
      data: {
        topic: input.topic,
        title: input.title,
        summary: input.summary,
        objectives: input.objectives ?? [],
        concept: input.concept,
        example: input.example,
        commonMistakes: input.commonMistakes,
        orderIndex,
        isPublished: input.isPublished ?? false,
        createdById: adminId,
        questionLinks: { create: toLinkRows(checkIds, practiceIds) },
      },
    });
    return this.getDetail(lesson.id);
  }

  async list(query: ListLessonsQueryInput) {
    const where: Prisma.LessonWhereInput = {
      ...(query.topic ? { topic: query.topic } : {}),
      ...(query.isPublished !== undefined ? { isPublished: query.isPublished } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.lesson.findMany({
        where,
        include: { questionLinks: { select: { role: true } } },
        orderBy: [{ topic: 'asc' }, { orderIndex: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.lesson.count({ where }),
    ]);

    return {
      data: items.map(toAdminLessonListItem),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async getDetail(id: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id }, include: LINK_INCLUDE });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return toAdminLessonDetail(lesson);
  }

  async update(id: string, input: UpdateLessonInput) {
    const existing = await this.prisma.lesson.findUnique({ where: { id }, include: { questionLinks: true } });
    if (!existing) throw new NotFoundException('Lesson not found');

    // Omitted link lists keep the current links; a provided list replaces them.
    const currentIds = (role: 'CHECK' | 'PRACTICE') =>
      existing.questionLinks.filter((l) => l.role === role).sort((a, b) => a.orderIndex - b.orderIndex).map((l) => l.questionId);
    const checkIds = input.checkQuestionIds ?? currentIds('CHECK');
    const practiceIds = input.practiceQuestionIds ?? currentIds('PRACTICE');
    const linksChanged = input.checkQuestionIds !== undefined || input.practiceQuestionIds !== undefined;
    const publishing = input.isPublished ?? existing.isPublished;

    // Validate whatever is changing, and everything when the lesson is (or stays) live —
    // a practice problem that was edited and lost its verification must not stay public.
    if (linksChanged || publishing) await this.assertLinksValid(checkIds, practiceIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.lesson.update({
        where: { id },
        data: {
          topic: input.topic,
          title: input.title,
          summary: input.summary,
          objectives: input.objectives,
          concept: input.concept,
          example: input.example,
          commonMistakes: input.commonMistakes,
          orderIndex: input.orderIndex,
          isPublished: input.isPublished,
        },
      });
      if (linksChanged) {
        await tx.lessonQuestion.deleteMany({ where: { lessonId: id } });
        await tx.lessonQuestion.createMany({ data: toLinkRows(checkIds, practiceIds).map((row) => ({ ...row, lessonId: id })) });
      }
    });
    return this.getDetail(id);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.lesson.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Lesson not found');
    // LessonProgress, question links and check responses all cascade (onDelete: Cascade).
    await this.prisma.lesson.delete({ where: { id } });
  }

  /** Knowledge checks must be approved MCQs; practice problems must be approved coding
   * problems whose reference solutions passed verification (Phase 18 quality gate). */
  private async assertLinksValid(checkIds: string[], practiceIds: string[]): Promise<void> {
    const ids = [...checkIds, ...practiceIds];
    if (ids.length === 0) return;
    const questions = await this.prisma.question.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        title: true,
        type: true,
        approvalStatus: true,
        codingQuestion: { select: { referenceSolutions: { select: { verificationSubmission: { select: { status: true } } } } } },
      },
    });
    const byId = new Map(questions.map((q) => [q.id, q]));
    const details: LinkIssue[] = [];

    for (const id of checkIds) {
      const q = byId.get(id);
      if (!q) details.push({ field: 'checkQuestionIds', issue: `question ${id} does not exist` });
      else if (q.type !== 'MCQ') details.push({ field: 'checkQuestionIds', issue: `"${q.title}" is not an MCQ — knowledge checks must be MCQs` });
      else if (q.approvalStatus !== 'APPROVED') details.push({ field: 'checkQuestionIds', issue: `"${q.title}" is not approved yet` });
    }
    for (const id of practiceIds) {
      const q = byId.get(id);
      if (!q) {
        details.push({ field: 'practiceQuestionIds', issue: `question ${id} does not exist` });
        continue;
      }
      if (q.type !== 'CODING') {
        details.push({ field: 'practiceQuestionIds', issue: `"${q.title}" is not a coding problem` });
        continue;
      }
      if (q.approvalStatus !== 'APPROVED') details.push({ field: 'practiceQuestionIds', issue: `"${q.title}" is not approved yet` });
      const verification = questionVerificationStatus(
        (q.codingQuestion?.referenceSolutions ?? []).map((rs) => solutionVerificationStatus(rs.verificationSubmission)),
      );
      if (verification !== 'PASSED') {
        details.push({ field: 'practiceQuestionIds', issue: `"${q.title}" has not passed reference-solution verification` });
      }
    }

    if (details.length > 0) {
      throw new UnprocessableEntityException({
        error: { code: 'UNPROCESSABLE_ENTITY', message: 'Some attached questions cannot be used in a lesson', details },
      });
    }
  }
}

function toLinkRows(checkIds: string[], practiceIds: string[]) {
  return [
    ...checkIds.map((questionId, orderIndex) => ({ questionId, role: 'CHECK' as const, orderIndex })),
    ...practiceIds.map((questionId, orderIndex) => ({ questionId, role: 'PRACTICE' as const, orderIndex })),
  ];
}
