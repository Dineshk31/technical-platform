import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateLessonInput, ListLessonsQueryInput, UpdateLessonInput } from '@technical-platform/shared';
import type { Prisma } from '../../../generated/prisma/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toAdminLessonDetail, toAdminLessonListItem } from './dto/lesson.dto.js';

/**
 * Admin authoring — create/list/get/update/delete. Mirrors QuestionsService's
 * shape (list narrow, detail full, update partial) and AssessmentsService's
 * `orderIndex ?? count(where: parent)` append-at-end default for new content
 * (see docs/PHASE_16_LEARN_ARCHITECTURE_AUDIT.md §6).
 */
@Injectable()
export class LessonsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(adminId: string, input: CreateLessonInput) {
    const orderIndex = input.orderIndex ?? (await this.prisma.lesson.count({ where: { topic: input.topic } }));
    const lesson = await this.prisma.lesson.create({
      data: {
        topic: input.topic,
        title: input.title,
        summary: input.summary,
        concept: input.concept,
        example: input.example,
        commonMistakes: input.commonMistakes,
        orderIndex,
        isPublished: input.isPublished ?? false,
        createdById: adminId,
      },
    });
    return toAdminLessonDetail(lesson);
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
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return toAdminLessonDetail(lesson);
  }

  async update(id: string, input: UpdateLessonInput) {
    const existing = await this.prisma.lesson.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Lesson not found');

    const lesson = await this.prisma.lesson.update({
      where: { id },
      data: {
        topic: input.topic,
        title: input.title,
        summary: input.summary,
        concept: input.concept,
        example: input.example,
        commonMistakes: input.commonMistakes,
        orderIndex: input.orderIndex,
        isPublished: input.isPublished,
      },
    });
    return toAdminLessonDetail(lesson);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.lesson.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Lesson not found');
    // LessonProgress cascades (onDelete: Cascade) — no orphaned progress rows.
    await this.prisma.lesson.delete({ where: { id } });
  }
}
