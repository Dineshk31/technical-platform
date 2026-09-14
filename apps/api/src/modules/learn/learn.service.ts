import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toStudentLessonDetail, toStudentLessonListItem } from './dto/lesson.dto.js';

/**
 * The student-facing read + progress side of Learn — only ever serves
 * `isPublished: true` lessons, the same visibility gate PracticeService
 * applies via `approvalStatus: 'APPROVED'` on Question. Progress is always
 * computed from real `LessonProgress` rows, never estimated (see
 * docs/PHASE_16_LEARN_ARCHITECTURE_AUDIT.md §4/§7).
 */
@Injectable()
export class LearnService {
  constructor(private readonly prisma: PrismaService) {}

  async listTopicLessons(userId: string, topic: string) {
    const [lessons, myProgress] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { topic, isPublished: true },
        orderBy: { orderIndex: 'asc' },
      }),
      this.prisma.lessonProgress.findMany({ where: { userId, lesson: { topic } }, select: { lessonId: true } }),
    ]);
    const completedIds = new Set(myProgress.map((p) => p.lessonId));
    return lessons.map((l) => toStudentLessonListItem(l, completedIds.has(l.id)));
  }

  async getLesson(userId: string, id: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (!lesson || !lesson.isPublished) {
      throw new NotFoundException('Lesson not found');
    }
    const progress = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId: id } },
    });
    return toStudentLessonDetail(lesson, progress !== null);
  }

  /** Idempotent — marking an already-completed lesson complete again is a no-op
   * (real re-completion just refreshes completedAt), matching PracticeCodeDraft's
   * upsert-on-save pattern rather than erroring on a duplicate. */
  async completeLesson(userId: string, id: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (!lesson || !lesson.isPublished) {
      throw new NotFoundException('Lesson not found');
    }
    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId: id } },
      create: { userId, lessonId: id },
      update: { completedAt: new Date() },
    });
    return { lessonId: id, completed: true };
  }

  /**
   * The Learn counterpart to PracticeService.getProgress() — totals, a
   * byTopic breakdown (only topics with at least one published lesson, never
   * a fabricated 20-topic grid), and a single deterministic `continueLesson`
   * pick: among topics this student has started but not finished, the one
   * they most recently completed a lesson in, then the next uncompleted
   * lesson in that topic by orderIndex. Reused by both a future Learn
   * landing page and Student Home's continue-card (see audit §9) — one
   * aggregation, multiple consumers, the same pattern practice/progress
   * already establishes.
   */
  async getProgress(userId: string) {
    const [publishedLessons, myProgress] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { isPublished: true },
        select: { id: true, topic: true, orderIndex: true },
        orderBy: [{ topic: 'asc' }, { orderIndex: 'asc' }],
      }),
      this.prisma.lessonProgress.findMany({
        where: { userId },
        select: { lessonId: true, completedAt: true },
      }),
    ]);

    const completedAtById = new Map(myProgress.map((p) => [p.lessonId, p.completedAt]));
    const totalLessons = publishedLessons.length;
    const completedLessons = publishedLessons.filter((l) => completedAtById.has(l.id)).length;

    const stats = new Map<string, { total: number; completed: number }>();
    for (const l of publishedLessons) {
      const entry = stats.get(l.topic) ?? { total: 0, completed: 0 };
      entry.total += 1;
      if (completedAtById.has(l.id)) entry.completed += 1;
      stats.set(l.topic, entry);
    }
    const byTopic = [...stats.entries()]
      .map(([topic, s]) => ({ topic, ...s }))
      .sort((a, b) => b.total - a.total || a.topic.localeCompare(b.topic));

    // A topic "in progress": at least one completed lesson, at least one not.
    let continueLesson: { lessonId: string; title: string; topic: string; lastActivityAt: Date } | null = null;
    let latestCompletionAt = -Infinity;
    let inProgressTopic: string | null = null;
    for (const [topic, s] of stats) {
      if (s.completed === 0 || s.completed >= s.total) continue;
      const topicLessons = publishedLessons.filter((l) => l.topic === topic);
      const latestInTopic = Math.max(
        ...topicLessons.filter((l) => completedAtById.has(l.id)).map((l) => completedAtById.get(l.id)!.getTime()),
      );
      if (latestInTopic > latestCompletionAt) {
        latestCompletionAt = latestInTopic;
        inProgressTopic = topic;
      }
    }
    if (inProgressTopic) {
      const nextInTopic = publishedLessons
        .filter((l) => l.topic === inProgressTopic)
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .find((l) => !completedAtById.has(l.id));
      if (nextInTopic) {
        const full = await this.prisma.lesson.findUnique({ where: { id: nextInTopic.id }, select: { title: true } });
        // Exposed so Student Home can compare recency against Practice's own
        // continueQuestion pick — "what did you touch most recently," not a
        // fixed pillar order (see docs/PHASE_16_LEARN_ARCHITECTURE_AUDIT.md §9).
        continueLesson = { lessonId: nextInTopic.id, title: full!.title, topic: inProgressTopic, lastActivityAt: new Date(latestCompletionAt) };
      }
    }

    return { totalLessons, completedLessons, byTopic, continueLesson };
  }
}
