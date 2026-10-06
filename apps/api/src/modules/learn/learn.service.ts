import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { AnswerLessonCheckInput } from '@technical-platform/shared';
import type { Prisma } from '../../../generated/prisma/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isMcqAnswerCorrect } from '../scoring/scoring.util.js';
import { toStudentCheck, toStudentLessonDetail, toStudentLessonListItem } from './dto/lesson.dto.js';
import { canSelfComplete, checkProgress, isRequiredCheck, isServedPractice, passedAllChecks, pickContinueLesson } from './lesson-completion.util.js';

// What the student lesson page needs from each attached question. `isCorrect` on MCQ
// options is deliberately NOT selected: correctness never leaves the server except as
// the grade of the student's own answer.
const STUDENT_LINK_INCLUDE = {
  questionLinks: {
    orderBy: { orderIndex: 'asc' },
    include: {
      question: {
        select: {
          id: true,
          title: true,
          type: true,
          difficulty: true,
          approvalStatus: true,
          mcqQuestion: {
            select: {
              mcqType: true,
              questionText: true,
              codeSnippet: true,
              explanation: true,
              options: { select: { id: true, optionText: true, orderIndex: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.LessonInclude;

/**
 * The student-facing read + progress side of Learn — only ever serves
 * `isPublished: true` lessons, the same visibility gate PracticeService
 * applies via `approvalStatus: 'APPROVED'` on Question. Progress is always
 * computed from real `LessonProgress` rows, never estimated (see
 * docs/PHASE_16_LEARN_ARCHITECTURE_AUDIT.md §4/§7).
 *
 * Phase 18: a lesson with knowledge checks is completed by answering every required
 * check correctly (graded here, on the server) — "Mark complete" only exists for
 * lessons without checks. Every read and write is scoped to the caller's own userId.
 */
@Injectable()
export class LearnService {
  constructor(private readonly prisma: PrismaService) {}

  async listTopicLessons(userId: string, topic: string) {
    const [lessons, myProgress, myResponses] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { topic, isPublished: true },
        orderBy: { orderIndex: 'asc' },
        include: { questionLinks: { select: { role: true, questionId: true, question: { select: { type: true, approvalStatus: true } } } } },
      }),
      this.prisma.lessonProgress.findMany({ where: { userId, lesson: { topic } }, select: { lessonId: true } }),
      this.prisma.lessonCheckResponse.findMany({
        where: { userId, lesson: { topic } },
        select: { lessonId: true, questionId: true, isCorrect: true },
      }),
    ]);
    const completedIds = new Set(myProgress.map((p) => p.lessonId));
    return lessons.map((l) => {
      const required = l.questionLinks.filter(isRequiredCheck).map((link) => link.questionId);
      const progress = checkProgress(required, myResponses.filter((r) => r.lessonId === l.id));
      return toStudentLessonListItem(l, completedIds.has(l.id), progress);
    });
  }

  async getLesson(userId: string, id: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id }, include: STUDENT_LINK_INCLUDE });
    if (!lesson || !lesson.isPublished) {
      throw new NotFoundException('Lesson not found');
    }

    const checkLinks = lesson.questionLinks.filter(isRequiredCheck);
    const practiceLinks = lesson.questionLinks.filter(isServedPractice);
    const practiceIds = practiceLinks.map((l) => l.questionId);

    const [progress, responses, practiceSubmissions] = await Promise.all([
      this.prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId: id } } }),
      this.prisma.lessonCheckResponse.findMany({ where: { userId, lessonId: id } }),
      practiceIds.length > 0
        ? this.prisma.submission.findMany({
            // The student's own practice submissions only (attemptId null, userId = caller).
            where: { userId, questionId: { in: practiceIds } },
            select: { questionId: true, kind: true, status: true },
          })
        : Promise.resolve([]),
    ]);

    const responseByQuestion = new Map(responses.map((r) => [r.questionId, r]));
    const checks = checkLinks.map((link) => {
      const mcq = link.question.mcqQuestion!;
      return toStudentCheck(
        {
          questionId: link.questionId,
          mcqType: mcq.mcqType,
          questionText: mcq.questionText,
          codeSnippet: mcq.codeSnippet,
          explanation: mcq.explanation,
          options: mcq.options,
        },
        responseByQuestion.get(link.questionId) ?? null,
      );
    });

    // Same solved/attempted rule as PracticeService.getMyStatusSets.
    const solved = new Set(practiceSubmissions.filter((s) => s.kind === 'SUBMIT' && s.status === 'ACCEPTED').map((s) => s.questionId));
    const attempted = new Set(practiceSubmissions.map((s) => s.questionId));
    const practice = practiceLinks.map((link) => ({
      questionId: link.questionId,
      title: link.question.title,
      difficulty: link.question.difficulty,
      status: solved.has(link.questionId) ? ('SOLVED' as const) : attempted.has(link.questionId) ? ('ATTEMPTED' as const) : ('NOT_ATTEMPTED' as const),
    }));

    return toStudentLessonDetail(lesson, progress !== null, {
      checks,
      checkProgress: checkProgress(checkLinks.map((l) => l.questionId), responses),
      practice,
    });
  }

  /**
   * POST /learn/lessons/:id/checks/:questionId/answer — graded on the server with the
   * same rule as assessment MCQs. Returns the grade and the explanation (only now that
   * the student has answered) but never the correct option ids. A wrong answer can be
   * retried; a correct one is kept as-is, so passing can't be undone by a later click.
   * Answering the last required check correctly completes the lesson.
   */
  async answerCheck(userId: string, lessonId: string, questionId: string, input: AnswerLessonCheckInput) {
    const link = await this.prisma.lessonQuestion.findUnique({
      where: { lessonId_questionId: { lessonId, questionId } },
      include: {
        lesson: { select: { isPublished: true } },
        question: { select: { type: true, approvalStatus: true, mcqQuestion: { include: { options: true } } } },
      },
    });
    if (!link || !link.lesson.isPublished || !isRequiredCheck(link) || !link.question.mcqQuestion) {
      throw new NotFoundException('Knowledge check not found');
    }
    const mcq = link.question.mcqQuestion;
    const validOptionIds = new Set(mcq.options.map((o) => o.id));
    if (!input.optionIds.every((id) => validOptionIds.has(id))) {
      throw new UnprocessableEntityException('One or more selected options do not belong to this question');
    }

    const existing = await this.prisma.lessonCheckResponse.findUnique({
      where: { userId_lessonId_questionId: { userId, lessonId, questionId } },
    });
    let response = existing;
    if (!existing?.isCorrect) {
      const isCorrect = isMcqAnswerCorrect(
        mcq.options.filter((o) => o.isCorrect).map((o) => o.id),
        input.optionIds,
      );
      const selectedOptionIds = [...new Set(input.optionIds)];
      response = await this.prisma.lessonCheckResponse.upsert({
        where: { userId_lessonId_questionId: { userId, lessonId, questionId } },
        create: { userId, lessonId, questionId, selectedOptionIds, isCorrect },
        update: { selectedOptionIds, isCorrect, attemptCount: { increment: 1 }, answeredAt: new Date() },
      });
    }

    const progress = await this.lessonCheckProgress(userId, lessonId);
    if (passedAllChecks(progress)) {
      await this.prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        create: { userId, lessonId },
        update: {},
      });
    }

    return {
      questionId,
      selectedOptionIds: response!.selectedOptionIds,
      isCorrect: response!.isCorrect,
      attemptCount: response!.attemptCount,
      explanation: mcq.explanation,
      checksTotal: progress.total,
      checksPassed: progress.passed,
      lessonCompleted: passedAllChecks(progress) || (await this.isCompleted(userId, lessonId)),
    };
  }

  /** Idempotent — marking an already-completed lesson complete again is a no-op
   * (real re-completion just refreshes completedAt), matching PracticeCodeDraft's
   * upsert-on-save pattern rather than erroring on a duplicate.
   * Phase 18: a lesson with knowledge checks can't be self-completed — passing the
   * checks is what completes it (and answerCheck does that automatically). */
  async completeLesson(userId: string, id: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (!lesson || !lesson.isPublished) {
      throw new NotFoundException('Lesson not found');
    }
    const progress = await this.lessonCheckProgress(userId, id);
    if (!canSelfComplete(progress) && !passedAllChecks(progress)) {
      throw new UnprocessableEntityException('Answer every knowledge check correctly to complete this lesson');
    }
    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId: id } },
      create: { userId, lessonId: id },
      update: { completedAt: new Date() },
    });
    return { lessonId: id, completed: true };
  }

  private async lessonCheckProgress(userId: string, lessonId: string) {
    const [links, responses] = await Promise.all([
      this.prisma.lessonQuestion.findMany({
        where: { lessonId },
        select: { role: true, questionId: true, question: { select: { type: true, approvalStatus: true } } },
      }),
      this.prisma.lessonCheckResponse.findMany({ where: { userId, lessonId }, select: { questionId: true, isCorrect: true } }),
    ]);
    return checkProgress(links.filter(isRequiredCheck).map((l) => l.questionId), responses);
  }

  private async isCompleted(userId: string, lessonId: string): Promise<boolean> {
    return (await this.prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId } } })) !== null;
  }

  /**
   * The Learn counterpart to PracticeService.getProgress() — totals, a
   * byTopic breakdown (only topics with at least one published lesson, never
   * a fabricated 20-topic grid), and a single deterministic `continueLesson`
   * pick from the student's most recent real activity (see pickContinueLesson):
   * a lesson they answered checks in but didn't finish, or the next lesson after
   * the one they most recently completed. Reused by both a future Learn
   * landing page and Student Home's continue-card (see audit §9) — one
   * aggregation, multiple consumers, the same pattern practice/progress
   * already establishes.
   *
   * Phase 18: each byTopic entry also names its first not-yet-completed lesson, so
   * a recommendation ("Learn Arrays") can open the exact lesson to do next.
   */
  async getProgress(userId: string) {
    const [publishedLessons, myProgress, myCheckActivity] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { isPublished: true },
        select: { id: true, topic: true, title: true, orderIndex: true },
        orderBy: [{ topic: 'asc' }, { orderIndex: 'asc' }],
      }),
      this.prisma.lessonProgress.findMany({
        where: { userId },
        select: { lessonId: true, completedAt: true },
      }),
      // Answering a check counts as working on a lesson, so a half-done lesson is resumable.
      this.prisma.lessonCheckResponse.findMany({ where: { userId }, select: { lessonId: true, answeredAt: true } }),
    ]);

    const completedAtById = new Map(myProgress.map((p) => [p.lessonId, p.completedAt]));
    const totalLessons = publishedLessons.length;
    const completedLessons = publishedLessons.filter((l) => completedAtById.has(l.id)).length;

    const stats = new Map<string, { total: number; completed: number; nextLesson: { id: string; title: string } | null }>();
    for (const l of publishedLessons) {
      const entry = stats.get(l.topic) ?? { total: 0, completed: 0, nextLesson: null };
      entry.total += 1;
      if (completedAtById.has(l.id)) entry.completed += 1;
      // Lessons arrive ordered by orderIndex within a topic, so the first uncompleted one wins.
      else if (!entry.nextLesson) entry.nextLesson = { id: l.id, title: l.title };
      stats.set(l.topic, entry);
    }
    const byTopic = [...stats.entries()]
      .map(([topic, s]) => ({
        topic,
        total: s.total,
        completed: s.completed,
        nextLessonId: s.nextLesson?.id ?? null,
        nextLessonTitle: s.nextLesson?.title ?? null,
      }))
      .sort((a, b) => b.total - a.total || a.topic.localeCompare(b.topic));

    // Exposed with lastActivityAt so Student Home can compare recency against
    // Practice's own continueQuestion pick — "what did you touch most recently," not a
    // fixed pillar order (see docs/PHASE_16_LEARN_ARCHITECTURE_AUDIT.md §9).
    const continueLesson = pickContinueLesson(
      publishedLessons,
      completedAtById,
      myCheckActivity.map((r) => ({ lessonId: r.lessonId, at: r.answeredAt })),
    );

    return { totalLessons, completedLessons, byTopic, continueLesson };
  }
}
