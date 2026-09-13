import { Injectable, NotFoundException } from '@nestjs/common';
import type { PracticeQuestionQueryInput, SaveCodeDraftInput } from '@technical-platform/shared';
import { Prisma } from '../../../generated/prisma/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { computePracticeStatus, toPracticeQuestionDetail, toPracticeQuestionListItem } from './dto/practice.dto.js';

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
      data: items.map((q) =>
        toPracticeQuestionListItem(q, solvedIds.has(q.id) ? 'SOLVED' : attemptedIds.has(q.id) ? 'ATTEMPTED' : 'NOT_ATTEMPTED'),
      ),
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
    const [totalByDifficulty, { solvedIds, attemptedIds }, recentSubmissions, recentDrafts] = await Promise.all([
      this.prisma.question.groupBy({
        by: ['difficulty'],
        where: { type: 'CODING', approvalStatus: 'APPROVED' },
        _count: { _all: true },
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
