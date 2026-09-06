import type {
  Assessment,
  AssessmentParticipant,
  AssessmentQuestion,
  AssessmentSection,
  Attempt,
  Question,
  User,
} from '../../../../generated/prisma/index.js';
import { computeEffectiveStatus } from '../utils/assessment-status.util.js';

export function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  // Prisma Decimal instance
  return Number((value as { toString(): string }).toString());
}

type SectionWithQuestions = AssessmentSection & {
  questions: (AssessmentQuestion & { question: Question })[];
};

type ParticipantWithUserAndAttempt = AssessmentParticipant & {
  user: Pick<User, 'id' | 'name' | 'email'>;
};

export type AdminAssessmentDetailSource = Assessment & {
  createdBy: Pick<User, 'id' | 'name' | 'email'>;
  sections: SectionWithQuestions[];
  participants: ParticipantWithUserAndAttempt[];
  attempts: Pick<Attempt, 'userId'>[];
};

export function toAdminAssessmentDetail(a: AdminAssessmentDetailSource) {
  const startedUserIds = new Set(a.attempts.map((att) => att.userId));
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    instructions: a.instructions,
    durationMinutes: a.durationMinutes,
    startAt: a.startAt,
    endAt: a.endAt,
    maxMarks: toNum(a.maxMarks),
    status: a.status,
    effectiveStatus: computeEffectiveStatus(a),
    createdBy: a.createdBy,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    sections: a.sections
      .slice()
      .sort((x, y) => x.orderIndex - y.orderIndex)
      .map((s) => ({
        id: s.id,
        title: s.title,
        sectionType: s.sectionType,
        orderIndex: s.orderIndex,
        questions: s.questions
          .slice()
          .sort((x, y) => x.orderIndex - y.orderIndex)
          .map((aq) => ({
            id: aq.id,
            questionId: aq.questionId,
            title: aq.question.title,
            type: aq.question.type,
            difficulty: aq.question.difficulty,
            marks: toNum(aq.marksOverride ?? aq.question.marks),
            orderIndex: aq.orderIndex,
          })),
      })),
    participants: a.participants.map((p) => ({
      id: p.id,
      userId: p.userId,
      name: p.user.name,
      email: p.user.email,
      source: p.source,
      groupLabel: p.groupLabel,
      assignedAt: p.assignedAt,
      hasStarted: startedUserIds.has(p.userId),
    })),
    sectionsCount: a.sections.length,
    questionsCount: a.sections.reduce((sum, s) => sum + s.questions.length, 0),
    participantsCount: a.participants.length,
  };
}

export type AdminAssessmentListSource = Assessment & {
  _count: { sections: number; participants: number };
};

export function toAdminAssessmentListItem(a: AdminAssessmentListSource) {
  return {
    id: a.id,
    title: a.title,
    status: a.status,
    effectiveStatus: computeEffectiveStatus(a),
    startAt: a.startAt,
    endAt: a.endAt,
    durationMinutes: a.durationMinutes,
    maxMarks: toNum(a.maxMarks),
    sectionsCount: a._count.sections,
    participantsCount: a._count.participants,
    createdAt: a.createdAt,
  };
}

export function toStudentAssessmentDetail(a: Assessment) {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    instructions: a.instructions,
    durationMinutes: a.durationMinutes,
    startAt: a.startAt,
    endAt: a.endAt,
    maxMarks: toNum(a.maxMarks),
    status: computeEffectiveStatus(a),
  };
}

export type StudentAssignedListSource = {
  assessment: Assessment;
  attempt: Pick<Attempt, 'id'> | null;
};

export function toStudentAssignedListItem({ assessment: a, attempt }: StudentAssignedListSource) {
  return {
    id: a.id,
    title: a.title,
    status: computeEffectiveStatus(a),
    startAt: a.startAt,
    endAt: a.endAt,
    durationMinutes: a.durationMinutes,
    maxMarks: toNum(a.maxMarks),
    hasStarted: attempt !== null,
    attemptId: attempt?.id ?? null,
  };
}
