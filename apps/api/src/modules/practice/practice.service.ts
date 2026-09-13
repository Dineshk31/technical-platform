import { Injectable, NotFoundException } from '@nestjs/common';
import type { PracticeQuestionQueryInput, SaveCodeDraftInput } from '@technical-platform/shared';
import { Prisma } from '../../../generated/prisma/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  computePracticeStatus,
  toPracticeQuestionDetail,
  toPracticeQuestionListItem,
  type PracticeQuestionStatus,
} from './dto/practice.dto.js';

const LIST_INCLUDE = {
  codingQuestion: { include: { languages: true } },
} satisfies Prisma.QuestionInclude;

const DETAIL_INCLUDE = {
  codingQuestion: {
    include: {
      languages: true,
      testCases: { where: { isHidden: false }, orderBy: { orderIndex: 'asc' } },
      starterTemplates: true,
    },
  },
} satisfies Prisma.QuestionInclude;

@Injectable()
export class PracticeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Problem Explorer — search/difficulty/topic/language filters plus this
   * student's own solved/attempted status, computed from real submission rows
   * (never invented). `status` filtering happens after the solved/attempted
   * sets are known (a student's own submission history is small enough that
   * this is one extra query, not an N+1 — see docs/database-schema.md's
   * `@@index([userId, questionId])` on submissions, added for exactly this).
   */
  async listQuestions(userId: string, query: PracticeQuestionQueryInput) {
    const where: Prisma.QuestionWhereInput = {
      type: 'CODING',
      approvalStatus: 'APPROVED',
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.topic ? { topics: { has: query.topic } } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(query.language ? { codingQuestion: { languages: { some: { language: query.language } } } } : {}),
    };

    const { solvedIds, attemptedIds } = await this.getMyStatusSets(userId);
    if (query.status === 'SOLVED') {
      where.id = { in: [...solvedIds] };
    } else if (query.status === 'ATTEMPTED') {
      where.id = { in: [...attemptedIds].filter((id) => !solvedIds.has(id)) };
    } else if (query.status === 'UNSOLVED') {
      where.id = { notIn: [...attemptedIds] };
    }

    const statusOf = (id: string): PracticeQuestionStatus =>
      solvedIds.has(id) ? 'SOLVED' : attemptedIds.has(id) ? 'ATTEMPTED' : 'NOT_ATTEMPTED';

    // 'newest'/'easiest'/'hardest' sort at the database level and paginate there —
    // cheap and scales normally. Native Postgres enums order by declaration sequence
    // (EASY, MEDIUM, HARD in schema.prisma), so `orderBy: { difficulty }` sorts
    // correctly with no extra mapping. 'recommended' needs this student's own
    // solved/attempted status, which isn't a column Postgres can sort by directly —
    // so for that one sort only, every matching question is pulled (bounded to a
    // generous cap; this platform's real question-bank scale is nowhere near it)
    // and ranked in application code instead.
    if (query.sort === 'recommended') {
      const RECOMMENDED_SCAN_CAP = 2000;
      const all = await this.prisma.question.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: RECOMMENDED_SCAN_CAP,
      });
      const difficultyRank: Record<string, number> = { EASY: 0, MEDIUM: 1, HARD: 2 };
      const statusRank: Record<string, number> = { NOT_ATTEMPTED: 0, ATTEMPTED: 1, SOLVED: 2 };
      const ranked = all
        .map((q) => ({ q, status: statusOf(q.id) }))
        .sort((a, b) => statusRank[a.status] - statusRank[b.status] || difficultyRank[a.q.difficulty] - difficultyRank[b.q.difficulty]);
      const total = ranked.length;
      const page = ranked.slice((query.page - 1) * query.pageSize, (query.page - 1) * query.pageSize + query.pageSize);
      return {
        data: page.map(({ q, status }) => toPracticeQuestionListItem(q, status)),
        meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
      };
    }

    const orderBy: Prisma.QuestionOrderByWithRelationInput =
      query.sort === 'easiest' ? { difficulty: 'asc' } : query.sort === 'hardest' ? { difficulty: 'desc' } : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.question.count({ where }),
    ]);

    return {
      data: items.map((q) => toPracticeQuestionListItem(q, statusOf(q.id))),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  }

  /** The practice workspace's question payload — restricted content (public test
   * cases only, no reference solutions), this student's status, and their saved
   * drafts for every language they've touched on this question. */
  async getQuestionDetail(userId: string, questionId: string) {
    const question = await this.prisma.question.findUnique({ where: { id: questionId }, include: DETAIL_INCLUDE });
    if (!question || question.type !== 'CODING' || !question.codingQuestion || question.approvalStatus !== 'APPROVED') {
      throw new NotFoundException('Question not found');
    }

    const [mySubmissions, drafts] = await Promise.all([
      this.prisma.submission.findMany({ where: { userId, questionId }, select: { kind: true, status: true } }),
      this.prisma.practiceCodeDraft.findMany({
        where: { userId, questionId },
        select: { language: true, code: true, updatedAt: true },
      }),
    ]);

    return toPracticeQuestionDetail(question, computePracticeStatus(mySubmissions), drafts);
  }

  /** The only write path for practice code drafts — mirrors
   * AssessmentsService.saveAttemptDraft, minus the attempt-freshness gate (practice
   * has no time window; a draft can always be saved as long as the question is
   * still approved practice content). */
  async saveDraft(userId: string, questionId: string, input: SaveCodeDraftInput) {
    const exists = await this.prisma.question.findFirst({
      where: { id: questionId, type: 'CODING', approvalStatus: 'APPROVED' },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Question not found');

    const draft = await this.prisma.practiceCodeDraft.upsert({
      where: { userId_questionId_language: { userId, questionId, language: input.language } },
      create: { userId, questionId, language: input.language, code: input.code },
      update: { code: input.code },
    });
    return { questionId: draft.questionId, language: draft.language, updatedAt: draft.updatedAt };
  }

  /**
   * Practice landing page stats — total available problems, solved, attempted,
   * the same breakdown by difficulty, this student's last few real submissions
   * (for a "recent activity" feed), and a single "continue" pick (the most
   * recently touched — by submission or saved draft — question that isn't
   * solved yet). Every number/row here comes straight from `questions` /
   * `submissions` / `practice_code_drafts`; nothing is estimated, guessed, or
   * hardcoded. Reused as-is by both the Practice landing page and Student
   * Home (StudentHomePage), so "continue where you left off" is defined once.
   */
  async getProgress(userId: string) {
    const [totalByDifficulty, questionTopics, { solvedIds, attemptedIds }, recentSubmissions, recentDrafts] = await Promise.all([
      this.prisma.question.groupBy({
        by: ['difficulty'],
        where: { type: 'CODING', approvalStatus: 'APPROVED' },
        _count: { _all: true },
      }),
      // Topics are a `String[]` (a question can carry several) — Prisma's `groupBy`
      // can't unnest an array column, so this is aggregated in application code below
      // from the full (id, topics) list rather than in SQL. Fine at this platform's
      // scale (the same "pull the small real list, aggregate in JS" pattern already
      // used for difficulty/status elsewhere in this service).
      this.prisma.question.findMany({
        where: { type: 'CODING', approvalStatus: 'APPROVED' },
        select: { id: true, topics: true },
      }),
      this.getMyStatusSets(userId),
      this.prisma.submission.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          questionId: true,
          kind: true,
          status: true,
          language: true,
          createdAt: true,
          question: { select: { question: { select: { title: true, difficulty: true } } } },
        },
      }),
      this.prisma.practiceCodeDraft.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: {
          questionId: true,
          language: true,
          updatedAt: true,
          question: { select: { question: { select: { title: true, difficulty: true } } } },
        },
      }),
    ]);

    const attemptedOnlyIds = [...attemptedIds].filter((id) => !solvedIds.has(id));
    const [solvedQuestions, attemptedQuestions] = await Promise.all([
      solvedIds.size > 0
        ? this.prisma.question.findMany({
            where: { id: { in: [...solvedIds] }, type: 'CODING', approvalStatus: 'APPROVED' },
            select: { id: true, difficulty: true },
          })
        : Promise.resolve([]),
      attemptedOnlyIds.length > 0
        ? this.prisma.question.findMany({
            where: { id: { in: attemptedOnlyIds }, type: 'CODING', approvalStatus: 'APPROVED' },
            select: { id: true, difficulty: true },
          })
        : Promise.resolve([]),
    ]);

    const totalProblems = totalByDifficulty.reduce((sum, d) => sum + d._count._all, 0);
    const byDifficulty = totalByDifficulty.map((d) => ({
      difficulty: d.difficulty,
      total: d._count._all,
      solved: solvedQuestions.filter((q) => q.difficulty === d.difficulty).length,
      attempted: attemptedQuestions.filter((q) => q.difficulty === d.difficulty).length,
    }));

    const byTopic: { topic: string; total: number; solved: number; attempted: number }[] = [];
    {
      const stats = new Map<string, { total: number; solved: number; attempted: number }>();
      for (const q of questionTopics) {
        for (const topic of q.topics) {
          const entry = stats.get(topic) ?? { total: 0, solved: 0, attempted: 0 };
          entry.total += 1;
          if (solvedIds.has(q.id)) entry.solved += 1;
          else if (attemptedIds.has(q.id)) entry.attempted += 1;
          stats.set(topic, entry);
        }
      }
      byTopic.push(
        ...[...stats.entries()]
          .map(([topic, s]) => ({ topic, ...s }))
          .sort((a, b) => b.total - a.total || a.topic.localeCompare(b.topic)),
      );
    }

    const recentActivity = recentSubmissions.map((s) => ({
      questionId: s.questionId,
      title: s.question.question.title,
      difficulty: s.question.question.difficulty,
      kind: s.kind,
      status: s.status,
      createdAt: s.createdAt,
    }));

    type ContinueCandidate = { questionId: string; title: string; difficulty: string; language: string; at: Date };
    const continueCandidates: ContinueCandidate[] = [
      ...recentSubmissions.map((s) => ({
        questionId: s.questionId,
        title: s.question.question.title,
        difficulty: s.question.question.difficulty,
        language: s.language,
        at: s.createdAt,
      })),
      ...recentDrafts.map((d) => ({
        questionId: d.questionId,
        title: d.question.question.title,
        difficulty: d.question.question.difficulty,
        language: d.language,
        at: d.updatedAt,
      })),
    ]
      .filter((c) => !solvedIds.has(c.questionId))
      .sort((a, b) => b.at.getTime() - a.at.getTime());
    const continueQuestion = continueCandidates[0]
      ? {
          questionId: continueCandidates[0].questionId,
          title: continueCandidates[0].title,
          difficulty: continueCandidates[0].difficulty,
          language: continueCandidates[0].language,
        }
      : null;

    return {
      totalProblems,
      solved: solvedQuestions.length,
      attempted: attemptedQuestions.length,
      byDifficulty,
      byTopic,
      recentActivity,
      continueQuestion,
    };
  }

  /** One shared query for "which questions has this student solved / touched at
   * all", reused by both listQuestions (status filter/annotation) and getProgress
   * (counts) so the solved/attempted rule is defined exactly once. */
  private async getMyStatusSets(userId: string): Promise<{ solvedIds: Set<string>; attemptedIds: Set<string> }> {
    const mySubmissions = await this.prisma.submission.findMany({
      where: { userId },
      select: { questionId: true, kind: true, status: true },
    });
    const solvedIds = new Set(mySubmissions.filter((s) => s.kind === 'SUBMIT' && s.status === 'ACCEPTED').map((s) => s.questionId));
    const attemptedIds = new Set(mySubmissions.map((s) => s.questionId));
    return { solvedIds, attemptedIds };
  }
}
