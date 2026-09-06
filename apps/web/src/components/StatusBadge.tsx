const CLASS_BY_STATUS: Record<string, string> = {
  DRAFT: 'badge-draft',
  PUBLISHED: 'badge',
  ACTIVE: 'badge-active',
  COMPLETED: 'badge-completed',
  ARCHIVED: 'badge-archived',
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${CLASS_BY_STATUS[status] ?? ''}`}>{status}</span>;
}
