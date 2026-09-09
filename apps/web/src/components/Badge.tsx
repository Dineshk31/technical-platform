import type { ReactNode } from 'react';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  neutral: 'badge-neutral',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  info: 'badge-info',
  accent: 'badge-accent',
};

export function Badge({ variant = 'neutral', children }: { variant?: BadgeVariant; children: ReactNode }) {
  return <span className={`badge ${VARIANT_CLASS[variant]}`}>{children}</span>;
}
