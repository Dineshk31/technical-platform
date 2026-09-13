import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

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

/**
 * `to` makes the whole card a navigation target (e.g. "5 pending → Review now") —
 * used for the admin Command Center's "needs attention" cards and any other
 * metric that should lead somewhere rather than just sit there decoratively
 * (see docs/PRODUCT_TRANSFORMATION_AUDIT.md §5 P0-B: "every metric card must
 * be actionable"). Without `to`, renders exactly as before — a plain, static
 * stat tile (still correct for genuinely non-actionable counts).
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  to,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  to?: string;
  tone?: 'neutral' | 'attention';
}) {
  const content = (
    <>
      <div>
        <p className="stat-card-label">{label}</p>
        <div className="stat-card-value">{value}</div>
        {hint && (
          <p className="stat-card-hint">
            {hint}
            {to && <ArrowRight size={12} style={{ marginLeft: '0.3rem', verticalAlign: 'middle' }} />}
          </p>
        )}
      </div>
      {icon && <div className="stat-card-icon">{icon}</div>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={`stat-card stat-card-link ${tone === 'attention' ? 'stat-card-attention' : ''}`}>
        {content}
      </Link>
    );
  }

  return <div className={`stat-card ${tone === 'attention' ? 'stat-card-attention' : ''}`}>{content}</div>;
}
