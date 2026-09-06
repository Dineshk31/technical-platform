import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type {
  AssignParticipantsInput,
  AttachQuestionInput,
  CreateAssessmentInput,
  CreateSectionInput,
  ListAssessmentsQueryInput,
  ListAssignedAssessmentsQueryInput,
  SaveCodeDraftInput,
  UpdateAssessmentInput,
  UpdateAssessmentQuestionInput,
  UpdateSectionInput,
} from '@technical-platform/shared';
import { Prisma, type Attempt } from '../../../generated/prisma/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toAdminAssessmentDetail, toAdminAssessmentListItem, toNum, toStudentAssessmentDetail, toStudentAssignedListItem } from './dto/assessment.dto.js';
import { computeEffectiveStatus } from './utils/assessment-status.util.js';

const ADMIN_DETAIL_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true } },
  sections: { include: { questions: { include: { question: true } } } },
  participants: { include: { user: { select: { id: true, name: true, email: true } } } },
  attempts: { select: { userId: true } },
} satisfies Prisma.AssessmentInclude;

@Injectable()
export class AssessmentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ============ Admin: assessment CRUD ============

  async create(adminId: string, input: CreateAssessmentInput) {
    const assessment = await this.prisma.assessment.create({
      data: {
        title: input.title,
        description: input.description,
        instructions: input.instructions,
        durationMinutes: input.durationMinutes,
        startAt: input.startAt,
        endAt: input.endAt,
        createdById: adminId,
      },
    });
    return this.getAdminDetail(assessment.id);
  }

  async list(query: ListAssessmentsQueryInput) {
    const where: Prisma.AssessmentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.assessment.findMany({
        where,
        include: { _count: { select: { sections: true, participants: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.assessment.count({ where }),
    ]);

    return {
      data: items.map(toAdminAssessmentListItem),
      meta: paginationMeta(query.page, query.pageSize, total),
    };
  }

  async getAdminDetail(id: string) {
    const assessment = await this.prisma.assessment.findUnique({ where: { id }, include: ADMIN_DETAIL_INCLUDE });
    if (!assessment) throw new NotFoundException('Assessment not found');
    return toAdminAssessmentDetail(assessment);
  }

  async update(id: string, input: UpdateAssessmentInput) {
    const assessment = await this.getAssessmentOrThrow(id);

    if (assessment.status === 'DRAFT') {
      // every field editable
    } else if (assessment.status === 'PUBLISHED') {
      const lockedFields = (['title', 'durationMinutes', 'startAt', 'endAt'] as const).filter(
        (field) => input[field] !== undefined,
      );
      if (lockedFields.length > 0) {
        throw new UnprocessableEntityException({
          error: {
            code: 'UNPROCESSABLE_ENTITY',
            message: 'Only description and instructions can be edited once an assessment is published',
            details: lockedFields.map((field) => ({ field, issue: 'locked after publish' })),
          },
        });
      }
    } else {
      throw new UnprocessableEntityException('This assessment is no longer editable');
    }

    const nextStartAt = input.startAt ?? assessment.startAt;
    const nextEndAt = input.endAt ?? assessment.endAt;
    if (!(nextEndAt > nextStartAt)) {
      throw new UnprocessableEntityException({
        error: {
          code: 'UNPROCESSABLE_ENTITY',
          message: 'endAt must be after startAt',
          details: [{ field: 'endAt', issue: 'must be after startAt' }],
        },
      });
    }

    await this.prisma.assessment.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        instructions: input.instructions,
        durationMinutes: input.durationMinutes,
        startAt: input.startAt,
        endAt: input.endAt,
      },
    });
    return this.getAdminDetail(id);
  }

  async remove(id: string): Promise<void> {
    const assessment = await this.getAssessmentOrThrow(id);
    if (assessment.status !== 'DRAFT') {
      throw new ConflictException('Only DRAFT assessments can be deleted');
    }
    await this.prisma.assessment.delete({ where: { id } });
  }

  // ============ Admin: lifecycle transitions ============

  async publish(id: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id },
      include: {
        sections: {
          include: {
            questions: { include: { question: { include: { codingQuestion: { include: { testCases: true } } } } } },
          },
        },
        participants: true,
      },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    if (assessment.status !== 'DRAFT') {
      throw new ConflictException('Only DRAFT assessments can be published');
    }

    const details: { field?: string; issue: string }[] = [];

    if (assessment.sections.length === 0) {
      details.push({ field: 'sections', issue: 'at least one section is required' });
    }
    for (const section of assessment.sections) {
      if (section.questions.length === 0) {
        details.push({ field: 'sections', issue: `section "${section.title}" has no questions` });
      }
      for (const aq of section.questions) {
        const testCases = aq.question.codingQuestion?.testCases ?? [];
        const hasPublic = testCases.some((tc) => !tc.isHidden);
        const hasHidden = testCases.some((tc) => tc.isHidden);
        if (!hasPublic || !hasHidden) {
          details.push({
            field: 'sections',
            issue: `question "${aq.question.title}" needs at least one public and one hidden test case`,
          });
        }
        // A question can be un-approved (Phase 3 review workflow) any time after being
        // attached to a still-DRAFT assessment — re-check at publish time, not just at
        // attach time, so a stale approval can never slip into a live exam.
        if (aq.question.approvalStatus !== 'APPROVED') {
          details.push({
            field: 'sections',
            issue: `question "${aq.question.title}" is no longer approved (status: ${aq.question.approvalStatus})`,
          });
        }
      }
    }
    if (!(assessment.endAt > assessment.startAt)) {
      details.push({ field: 'endAt', issue: 'must be after startAt' });
    }
    if (!(assessment.endAt > new Date())) {
      details.push({ field: 'endAt', issue: 'must be in the future' });
    }
    if (assessment.participants.length === 0) {
      details.push({ field: 'participants', issue: 'at least one participant is required' });
    }

    if (details.length > 0) {
      throw new UnprocessableEntityException({
        error: { code: 'UNPROCESSABLE_ENTITY', message: 'Assessment is not ready to publish', details },
      });
    }

    await this.prisma.assessment.update({ where: { id }, data: { status: 'PUBLISHED' } });
    return this.getAdminDetail(id);
  }

  async unpublish(id: string) {
    const assessment = await this.getAssessmentOrThrow(id);
    if (assessment.status !== 'PUBLISHED') {
      throw new ConflictException('Only PUBLISHED assessments can be unpublished');
    }
    if (computeEffectiveStatus(assessment) !== 'PUBLISHED') {
      throw new ConflictException('This assessment has already started or completed and can no longer be unpublished');
    }
    await this.prisma.assessment.update({ where: { id }, data: { status: 'DRAFT' } });
    return this.getAdminDetail(id);
  }

  async archive(id: string) {
    const assessment = await this.getAssessmentOrThrow(id);
    if (computeEffectiveStatus(assessment) !== 'COMPLETED') {
      throw new ConflictException('Only completed assessments can be archived');
    }
    await this.prisma.assessment.update({ where: { id }, data: { status: 'ARCHIVED' } });
    return this.getAdminDetail(id);
  }

  // ============ Admin: sections ============

  async addSection(assessmentId: string, input: CreateSectionInput) {
    await this.assertDraftForStructuralEdit(assessmentId);
    const orderIndex = input.orderIndex ?? (await this.prisma.assessmentSection.count({ where: { assessmentId } }));
    await this.prisma.assessmentSection.create({
      data: { assessmentId, title: input.title, sectionType: input.sectionType, orderIndex },
    });
    return this.getAdminDetail(assessmentId);
  }

  async updateSection(assessmentId: string, sectionId: string, input: UpdateSectionInput) {
    await this.assertDraftForStructuralEdit(assessmentId);
    await this.getSectionOrThrow(assessmentId, sectionId);
    await this.prisma.assessmentSection.update({
      where: { id: sectionId },
      data: { title: input.title, orderIndex: input.orderIndex },
    });
    return this.getAdminDetail(assessmentId);
  }

  async removeSection(assessmentId: string, sectionId: string): Promise<void> {
    await this.assertDraftForStructuralEdit(assessmentId);
    await this.getSectionOrThrow(assessmentId, sectionId);
    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentSection.delete({ where: { id: sectionId } });
      await recomputeMaxMarks(tx, assessmentId);
    });
  }

  // ============ Admin: assessment questions ============

  async attachQuestion(assessmentId: string, sectionId: string, input: AttachQuestionInput) {
    await this.assertDraftForStructuralEdit(assessmentId);
    await this.getSectionOrThrow(assessmentId, sectionId);

    const question = await this.prisma.question.findUnique({ where: { id: input.questionId } });
    if (!question) throw new NotFoundException('Question not found');
    if (question.type !== 'CODING') {
      throw new UnprocessableEntityException('Only coding questions can be attached in Phase 2');
    }
    if (question.approvalStatus !== 'APPROVED') {
      throw new UnprocessableEntityException('Only approved questions can be attached to an assessment');
    }

    const existing = await this.prisma.assessmentQuestion.findUnique({
      where: { sectionId_questionId: { sectionId, questionId: input.questionId } },
    });
    if (existing) throw new ConflictException('This question is already attached to this section');

    const orderIndex = input.orderIndex ?? (await this.prisma.assessmentQuestion.count({ where: { sectionId } }));

    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentQuestion.create({
        data: { sectionId, questionId: input.questionId, marksOverride: input.marksOverride, orderIndex },
      });
      await recomputeMaxMarks(tx, assessmentId);
    });

    return this.getAdminDetail(assessmentId);
  }

  async updateAssessmentQuestion(
    assessmentId: string,
    sectionId: string,
    aqId: string,
    input: UpdateAssessmentQuestionInput,
  ) {
    await this.assertDraftForStructuralEdit(assessmentId);
    await this.getSectionOrThrow(assessmentId, sectionId);
    const aq = await this.prisma.assessmentQuestion.findFirst({ where: { id: aqId, sectionId } });
    if (!aq) throw new NotFoundException('Question link not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentQuestion.update({
        where: { id: aqId },
        data: { marksOverride: input.marksOverride, orderIndex: input.orderIndex },
      });
      await recomputeMaxMarks(tx, assessmentId);
    });
    return this.getAdminDetail(assessmentId);
  }

  async detachQuestion(assessmentId: string, sectionId: string, aqId: string): Promise<void> {
    await this.assertDraftForStructuralEdit(assessmentId);
    await this.getSectionOrThrow(assessmentId, sectionId);
    const aq = await this.prisma.assessmentQuestion.findFirst({ where: { id: aqId, sectionId } });
    if (!aq) throw new NotFoundException('Question link not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentQuestion.delete({ where: { id: aqId } });
      await recomputeMaxMarks(tx, assessmentId);
    });
  }

  // ============ Admin: participants ============

  async assignParticipants(assessmentId: string, input: AssignParticipantsInput) {
    const assessment = await this.getAssessmentOrThrow(assessmentId);
    const effective = computeEffectiveStatus(assessment);
    if (effective !== 'DRAFT' && effective !== 'PUBLISHED') {
      throw new ConflictException('Participants can only be assigned before the assessment becomes active');
    }

    let candidates: { id: string }[];
    const source: 'DIRECT' | 'GROUP' = input.userIds && input.userIds.length > 0 ? 'DIRECT' : 'GROUP';
    let groupLabel: string | null = null;

    if (source === 'DIRECT') {
      candidates = await this.prisma.user.findMany({
        where: { id: { in: input.userIds }, role: { code: 'STUDENT' } },
        select: { id: true },
      });
      if (candidates.length !== input.userIds!.length) {
        throw new UnprocessableEntityException('One or more userIds are invalid or do not belong to a student');
      }
    } else {
      groupLabel = [input.department, input.batch].filter(Boolean).join(' / ');
      candidates = await this.prisma.user.findMany({
        where: {
          role: { code: 'STUDENT' },
          ...(input.department ? { department: input.department } : {}),
          ...(input.batch ? { batch: input.batch } : {}),
        },
        select: { id: true },
      });
      if (candidates.length === 0) {
        throw new UnprocessableEntityException('No students match the given department/batch filter');
      }
    }

    const existing = await this.prisma.assessmentParticipant.findMany({
      where: { assessmentId, userId: { in: candidates.map((c) => c.id) } },
      select: { userId: true },
    });
    const existingIds = new Set(existing.map((e) => e.userId));
    const toAdd = candidates.filter((c) => !existingIds.has(c.id));

    if (toAdd.length > 0) {
      await this.prisma.assessmentParticipant.createMany({
        data: toAdd.map((c) => ({ assessmentId, userId: c.id, source, groupLabel })),
      });
    }

    return { added: toAdd.length, alreadyAssigned: existingIds.size, total: candidates.length };
  }

  async unassignParticipant(assessmentId: string, userId: string): Promise<void> {
    const participant = await this.prisma.assessmentParticipant.findUnique({
      where: { assessmentId_userId: { assessmentId, userId } },
    });
    if (!participant) throw new NotFoundException('Participant not found');

    const attempt = await this.prisma.attempt.findUnique({ where: { assessmentId_userId: { assessmentId, userId } } });
    if (attempt) throw new ConflictException('Cannot unassign a student who has already started the assessment');

    await this.prisma.assessmentParticipant.delete({ where: { id: participant.id } });
  }

  // ============ Student ============

  async listAssigned(studentId: string, query: ListAssignedAssessmentsQueryInput) {
    const where: Prisma.AssessmentParticipantWhereInput = {
      userId: studentId,
      assessment: { status: 'PUBLISHED' },
    };

    const [participantRows, total] = await Promise.all([
      this.prisma.assessmentParticipant.findMany({
        where,
        include: { assessment: true },
        orderBy: { assessment: { startAt: 'asc' } },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.assessmentParticipant.count({ where }),
    ]);

    const assessmentIds = participantRows.map((p) => p.assessmentId);
    const attempts = await this.prisma.attempt.findMany({
      where: { userId: studentId, assessmentId: { in: assessmentIds } },
      select: { id: true, assessmentId: true },
    });
    const attemptByAssessment = new Map(attempts.map((a) => [a.assessmentId, a]));

    return {
      data: participantRows.map((p) =>
        toStudentAssignedListItem({
          assessment: p.assessment,
          attempt: attemptByAssessment.get(p.assessmentId) ?? null,
        }),
      ),
      meta: paginationMeta(query.page, query.pageSize, total),
    };
  }

  async getStudentDetail(studentId: string, assessmentId: string) {
    const participant = await this.prisma.assessmentParticipant.findUnique({
      where: { assessmentId_userId: { assessmentId, userId: studentId } },
      include: { assessment: true },
    });
    if (!participant || participant.assessment.status !== 'PUBLISHED') {
      throw new NotFoundException('Assessment not found');
    }
    return toStudentAssessmentDetail(participant.assessment);
  }

  async startAttempt(assessmentId: string, studentId: string) {
    const participant = await this.prisma.assessmentParticipant.findUnique({
      where: { assessmentId_userId: { assessmentId, userId: studentId } },
      include: { assessment: true },
    });
    if (!participant || participant.assessment.status !== 'PUBLISHED') {
      throw new NotFoundException('Assessment not found');
    }

    const existing = await this.prisma.attempt.findUnique({
      where: { assessmentId_userId: { assessmentId, userId: studentId } },
    });
    if (existing) {
      return toAttemptDto(await this.ensureAttemptFreshness(existing));
    }

    const effective = computeEffectiveStatus(participant.assessment);
    if (effective !== 'ACTIVE') {
      throw new UnprocessableEntityException(
        effective === 'PUBLISHED' ? 'This assessment has not started yet' : 'This assessment is no longer accepting attempts',
      );
    }

    const startedAt = new Date();
    const durationEnd = new Date(startedAt.getTime() + participant.assessment.durationMinutes * 60_000);
    const endsAt = durationEnd < participant.assessment.endAt ? durationEnd : participant.assessment.endAt;

    try {
      const attempt = await this.prisma.attempt.create({
        data: { assessmentId, userId: studentId, startedAt, endsAt },
      });
      return toAttemptDto(attempt);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.attempt.findUnique({
          where: { assessmentId_userId: { assessmentId, userId: studentId } },
        });
        if (raced) return toAttemptDto(raced);
      }
      throw error;
    }
  }

  /** Phase 4: server-authoritative countdown source — see docs/assessment-system.md §3. */
  async getAttemptStatus(studentId: string, assessmentId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { assessmentId_userId: { assessmentId, userId: studentId } },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    const fresh = await this.ensureAttemptFreshness(attempt);
    return {
      attemptId: fresh.id,
      status: fresh.status,
      startedAt: fresh.startedAt,
      endsAt: fresh.endsAt,
      submittedAt: fresh.submittedAt,
      serverNow: new Date(),
    };
  }

  /** Restricted-content questions for the student's own attempt — no hidden test cases,
   * no reference solutions, structurally absent from the DTO (see docs/security.md §2). */
  async getStudentQuestions(studentId: string, assessmentId: string) {
    const participant = await this.prisma.assessmentParticipant.findUnique({
      where: { assessmentId_userId: { assessmentId, userId: studentId } },
    });
    if (!participant) throw new NotFoundException('Assessment not found');

    const attempt = await this.prisma.attempt.findUnique({
      where: { assessmentId_userId: { assessmentId, userId: studentId } },
    });
    if (!attempt) throw new NotFoundException('Attempt not found — start the assessment first');
    await this.ensureAttemptFreshness(attempt);

    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        sections: {
          orderBy: { orderIndex: 'asc' },
          include: {
            questions: {
              orderBy: { orderIndex: 'asc' },
              include: {
                question: {
                  include: {
                    codingQuestion: {
                      include: {
                        languages: true,
                        testCases: { where: { isHidden: false }, orderBy: { orderIndex: 'asc' } },
                        starterTemplates: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    const questionIds = assessment.sections.flatMap((s) => s.questions.map((aq) => aq.questionId));
    const submissions = await this.prisma.submission.findMany({
      where: { attemptId: attempt.id, questionId: { in: questionIds } },
      select: { questionId: true, kind: true, status: true },
    });
    const statusByQuestion = computeQuestionStatuses(submissions);

    return {
      attemptId: attempt.id,
      assessmentTitle: assessment.title,
      sections: assessment.sections.map((s) => ({
        id: s.id,
        title: s.title,
        orderIndex: s.orderIndex,
        questions: s.questions.map((aq) => {
          const cq = aq.question.codingQuestion;
          return {
            id: aq.id,
            questionId: aq.questionId,
            title: aq.question.title,
            difficulty: aq.question.difficulty,
            marks: toNum(aq.marksOverride ?? aq.question.marks),
            orderIndex: aq.orderIndex,
            status: statusByQuestion.get(aq.questionId) ?? 'NOT_ATTEMPTED',
            problemStatement: cq?.problemStatement ?? '',
            inputFormat: cq?.inputFormat ?? '',
            outputFormat: cq?.outputFormat ?? '',
            constraints: cq?.constraints ?? [],
            examples: (cq?.examples as unknown) ?? [],
            timeLimitSeconds: toNum(cq?.timeLimitSeconds),
            memoryLimitMb: cq?.memoryLimitMb ?? 0,
            supportedLanguages: (cq?.languages ?? []).map((l) => l.language),
            publicTestCases: (cq?.testCases ?? []).map((tc) => ({
              id: tc.id,
              input: tc.input,
              expectedOutput: tc.expectedOutput,
            })),
            // Question-specific only — never a fallback here; the frontend applies the
            // generic per-language fallback (packages/shared) when a language has none.
            starterCode: Object.fromEntries((cq?.starterTemplates ?? []).map((st) => [st.language, st.code])),
          };
        }),
      })),
    };
  }

  /** Early finish — a lifecycle transition only. No score is computed here: with no code
   * execution or MCQs built yet (Phases 5/11), there is nothing to score. Full finalization
   * (docs/assessment-system.md §5, ResultsService) is Phase 8. */
  async submitAttempt(studentId: string, assessmentId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { assessmentId_userId: { assessmentId, userId: studentId } },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    const fresh = await this.ensureAttemptFreshness(attempt);
    if (fresh.status !== 'IN_PROGRESS') {
      throw new ConflictException('This attempt has already been finalized');
    }
    const updated = await this.prisma.attempt.update({
      where: { id: fresh.id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
    return { id: updated.id, status: updated.status, submittedAt: updated.submittedAt };
  }

  /** Backs the attempt-centric frontend route (/student/attempts/:attemptId) — ownership is
   * checked by userId match, not just record existence, so one student's attempt id can never
   * be used to read another's (see docs/security.md §1). */
  async getAttemptDetail(studentId: string, attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { assessment: { select: { id: true, title: true } } },
    });
    if (!attempt || attempt.userId !== studentId) throw new NotFoundException('Attempt not found');
    const fresh = await this.ensureAttemptFreshness(attempt);
    return {
      id: fresh.id,
      assessmentId: attempt.assessment.id,
      assessmentTitle: attempt.assessment.title,
      status: fresh.status,
      startedAt: fresh.startedAt,
      endsAt: fresh.endsAt,
      submittedAt: fresh.submittedAt,
    };
  }

  /** Bulk-fetch so the exam page loads every saved draft in one round trip instead of
   * one request per question/language (must not create excessive API/DB traffic).
   * Read-only — allowed regardless of attempt status, same as getAttemptDetail. */
  async getAttemptDrafts(studentId: string, attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.userId !== studentId) throw new NotFoundException('Attempt not found');

    return this.prisma.attemptCodeDraft.findMany({
      where: { attemptId },
      select: { questionId: true, language: true, code: true, updatedAt: true },
    });
  }

  /** The only write path for code drafts. Ownership and IN_PROGRESS are both enforced
   * here — a submitted/auto-submitted/expired attempt is read-only, backend-enforced,
   * not just a disabled button on the frontend (docs/security.md). */
  async saveAttemptDraft(studentId: string, attemptId: string, questionId: string, input: SaveCodeDraftInput) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.userId !== studentId) throw new NotFoundException('Attempt not found');

    const fresh = await this.ensureAttemptFreshness(attempt);
    if (fresh.status !== 'IN_PROGRESS') {
      throw new ConflictException('This attempt is no longer accepting changes');
    }

    const belongsToAssessment = await this.prisma.assessmentQuestion.findFirst({
      where: { questionId, section: { assessmentId: attempt.assessmentId } },
    });
    if (!belongsToAssessment) throw new NotFoundException('Question not found in this assessment');

    const draft = await this.prisma.attemptCodeDraft.upsert({
      where: { attemptId_questionId_language: { attemptId, questionId, language: input.language } },
      create: { attemptId, questionId, language: input.language, code: input.code },
      update: { code: input.code },
    });
    return { questionId: draft.questionId, language: draft.language, updatedAt: draft.updatedAt };
  }

  // ============ shared helpers ============

  /** Lazy expiry sweep: the one place an IN_PROGRESS attempt past its endsAt gets flipped to
   * AUTO_SUBMITTED. Every read/write path for an attempt goes through this first, so the backend
   * is authoritative regardless of what a client's own clock says (docs/security.md §1, "Student
   * submits after time expiry"). A periodic cron sweep for attempts nobody is actively viewing is
   * Phase 8 scope — not needed yet since nothing besides this attempt's own owner can read it. */
  private async ensureAttemptFreshness(attempt: Attempt): Promise<Attempt> {
    if (attempt.status === 'IN_PROGRESS' && new Date() > attempt.endsAt) {
      return this.prisma.attempt.update({
        where: { id: attempt.id },
        data: { status: 'AUTO_SUBMITTED', submittedAt: new Date() },
      });
    }
    return attempt;
  }

  private async getAssessmentOrThrow(id: string) {
    const assessment = await this.prisma.assessment.findUnique({ where: { id } });
    if (!assessment) throw new NotFoundException('Assessment not found');
    return assessment;
  }

  private async getSectionOrThrow(assessmentId: string, sectionId: string) {
    const section = await this.prisma.assessmentSection.findFirst({ where: { id: sectionId, assessmentId } });
    if (!section) throw new NotFoundException('Section not found');
    return section;
  }

  private async assertDraftForStructuralEdit(assessmentId: string): Promise<void> {
    const assessment = await this.getAssessmentOrThrow(assessmentId);
    if (assessment.status !== 'DRAFT') {
      throw new ConflictException('Sections and questions can only be modified while the assessment is a draft');
    }
  }
}

function paginationMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

function toAttemptDto(attempt: { id: string; assessmentId: string; startedAt: Date; endsAt: Date; status: string }) {
  return {
    id: attempt.id,
    assessmentId: attempt.assessmentId,
    startedAt: attempt.startedAt,
    endsAt: attempt.endsAt,
    status: attempt.status,
  };
}

type QuestionStatus = 'NOT_ATTEMPTED' | 'ATTEMPTED' | 'SOLVED';

/** docs/assessment-system.md §4. Always resolves to NOT_ATTEMPTED for every question until
 * Phase 5 adds code execution — there is no way for a Submission row to exist before then —
 * but is implemented against the real rule now so nothing needs reworking later. */
function computeQuestionStatuses(
  submissions: { questionId: string; kind: string; status: string }[],
): Map<string, QuestionStatus> {
  const map = new Map<string, QuestionStatus>();
  for (const s of submissions) {
    if (s.kind === 'SUBMIT' && s.status === 'ACCEPTED') {
      map.set(s.questionId, 'SOLVED');
      continue;
    }
    if (map.get(s.questionId) !== 'SOLVED') {
      map.set(s.questionId, 'ATTEMPTED');
    }
  }
  return map;
}

/** Exported so QuestionsService can keep an assessment's maxMarks correct when a
 * question it references is edited or deleted (only ever reachable for DRAFT
 * assessments — see QuestionsService.assertEditable). */
export async function recomputeMaxMarks(tx: Prisma.TransactionClient, assessmentId: string): Promise<void> {
  const rows = await tx.assessmentQuestion.findMany({
    where: { section: { assessmentId } },
    include: { question: true },
  });
  const total = rows.reduce((sum, aq) => sum + toNum(aq.marksOverride ?? aq.question.marks), 0);
  await tx.assessment.update({ where: { id: assessmentId }, data: { maxMarks: Math.round(total * 100) / 100 } });
}
