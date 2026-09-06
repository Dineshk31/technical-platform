const CLASS_BY_STATUS: Record<string, string> = {
  PENDING_REVIEW: 'badge-draft',
  APPROVED: 'badge-active',
  REJECTED: 'badge-archived',
  NEEDS_EDIT: 'badge-draft',
};

export function ApprovalBadge({ status }: { status: string }) {
  return <span className={`badge ${CLASS_BY_STATUS[status] ?? ''}`}>{status.replace('_', ' ')}</span>;
}

const DIFFICULTY_CLASS: Record<string, string> = {
  EASY: 'badge-active',
  MEDIUM: 'badge-draft',
  HARD: 'badge-archived',
};

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  return <span className={`badge ${DIFFICULTY_CLASS[difficulty] ?? ''}`}>{difficulty}</span>;
}
