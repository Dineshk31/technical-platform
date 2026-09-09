import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1 style={{ margin: 0, fontSize: 'var(--text-page-title)' }}>{title}</h1>
        {subtitle && <p style={{ margin: '0.25rem 0 0', color: 'var(--color-muted)', fontSize: 'var(--text-small)' }}>{subtitle}</p>}
      </div>
      {actions && <div className="action-row" style={{ marginBottom: 0 }}>{actions}</div>}
    </div>
  );
}
