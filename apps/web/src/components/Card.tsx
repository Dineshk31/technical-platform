import type { ReactNode } from 'react';

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`card ${className ?? ''}`}>
      {(title || actions) && (
        <div className="page-header" style={{ marginBottom: title ? '1rem' : 0 }}>
          {title && <h2 style={{ margin: 0 }}>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatCard({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode }) {
  return (
    <div className="stat-card">
      <div>
        <p className="stat-card-label">{label}</p>
        <div className="stat-card-value">{value}</div>
        {hint && <p className="stat-card-hint">{hint}</p>}
      </div>
      {icon && <div className="stat-card-icon">{icon}</div>}
    </div>
  );
}
