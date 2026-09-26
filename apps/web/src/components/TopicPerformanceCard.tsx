import type { TopicResultDto } from '../lib/results-api';

/**
 * Per-topic view of one attempt — shared by the student's result page and the
 * admin per-attempt detail, like ResultBreakdown. Every number (and the
 * `needsWork` flag) comes from the server's computeTopicBreakdown; this only
 * displays it. Renders nothing when the assessment's questions carry no topics,
 * rather than showing an empty card.
 */
export function TopicPerformanceCard({ topics }: { topics: TopicResultDto[] }) {
  if (topics.length === 0) return null;

  return (
    <div className="card">
      <div className="page-header" style={{ marginBottom: '0.35rem' }}>
        <h2 style={{ margin: 0 }}>Performance by topic</h2>
      </div>
      <p className="field-hint" style={{ marginTop: 0 }}>
        A topic needs work when less than half of its marks were earned. Questions covering several topics count toward each.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.85rem', marginTop: '0.75rem' }}>
        {topics.map((t) => (
          <div key={t.topic} className="card" style={{ padding: '0.85rem 1rem', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <strong style={{ fontSize: '0.9rem' }}>{t.topic}</strong>
              {t.needsWork && <span className="badge badge-warning">Needs work</span>}
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-label={`${t.topic}: ${t.percentage}% of marks`}
              aria-valuenow={t.percentage}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="progress-fill"
                style={{ width: `${Math.min(100, t.percentage)}%`, background: t.needsWork ? 'var(--color-warning)' : undefined }}
              />
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginTop: '0.4rem' }}>
              {t.marksObtained} / {t.maxMarks} marks ({t.percentage}%) · {t.solvedQuestions}/{t.totalQuestions} solved
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
