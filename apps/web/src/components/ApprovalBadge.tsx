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

// AI_GENERATED gets the plain (unmodified) badge style — the primary-blue
// "informational" look — so it reads distinctly from ApprovalBadge's green
// APPROVED/amber PENDING_REVIEW colors when the two badges sit side by side.
const SOURCE_CLASS: Record<string, string> = {
  MANUAL: 'badge-completed',
  AI_GENERATED: '',
};

export function SourceBadge({ source }: { source: string }) {
  return <span className={`badge ${SOURCE_CLASS[source] ?? ''}`}>{source.replace('_', ' ')}</span>;
}
