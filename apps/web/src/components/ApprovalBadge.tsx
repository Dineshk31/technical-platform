import { Badge, type BadgeVariant } from './Badge';

const APPROVAL_VARIANT: Record<string, BadgeVariant> = {
  PENDING_REVIEW: 'warning',
  APPROVED: 'success',
  REJECTED: 'neutral',
  NEEDS_EDIT: 'warning',
};

export function ApprovalBadge({ status }: { status: string }) {
  return <Badge variant={APPROVAL_VARIANT[status] ?? 'neutral'}>{status.replace('_', ' ')}</Badge>;
}

const DIFFICULTY_VARIANT: Record<string, BadgeVariant> = {
  EASY: 'success',
  MEDIUM: 'warning',
  HARD: 'danger',
};

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  return <Badge variant={DIFFICULTY_VARIANT[difficulty] ?? 'neutral'}>{difficulty}</Badge>;
}

// AI_GENERATED gets the accent (violet) look so it reads distinctly from
// ApprovalBadge's green APPROVED / amber PENDING_REVIEW when shown side by side.
const SOURCE_VARIANT: Record<string, BadgeVariant> = {
  MANUAL: 'neutral',
  AI_GENERATED: 'accent',
};

export function SourceBadge({ source }: { source: string }) {
  return <Badge variant={SOURCE_VARIANT[source] ?? 'neutral'}>{source.replace('_', ' ')}</Badge>;
}

const QUESTION_TYPE_VARIANT: Record<string, BadgeVariant> = {
  CODING: 'info',
  MCQ: 'success',
};

export function QuestionTypeBadge({ type }: { type: string }) {
  return <Badge variant={QUESTION_TYPE_VARIANT[type] ?? 'neutral'}>{type}</Badge>;
}
