import type { CSSProperties } from 'react';

export function Skeleton({ width, height = '0.85rem', style }: { width?: string | number; height?: string | number; style?: CSSProperties }) {
  return <div className="skeleton" style={{ width: width ?? '100%', height, ...style }} />;
}

export function SkeletonTable({ rows = 4, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', gap: '1rem', marginBottom: '0.85rem' }}>
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} width={c === 0 ? '28%' : '16%'} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function LoadingRow({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-row">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}
