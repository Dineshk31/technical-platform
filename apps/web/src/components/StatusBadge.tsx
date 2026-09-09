import { Badge, type BadgeVariant } from './Badge';

const VARIANT_BY_STATUS: Record<string, BadgeVariant> = {
  DRAFT: 'warning',
  PUBLISHED: 'info',
  ACTIVE: 'success',
  COMPLETED: 'neutral',
  ARCHIVED: 'neutral',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={VARIANT_BY_STATUS[status] ?? 'neutral'}>{status}</Badge>;
}
