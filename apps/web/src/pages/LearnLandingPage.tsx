import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, CheckCircle2, PartyPopper } from 'lucide-react';
import { CODING_TOPICS } from '@technical-platform/shared';
import { ApiError } from '../lib/api-client';
import { getLearnProgress, type LearnProgressDto } from '../lib/learn-api';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';

/**
 * Learn landing (§P16-C) — organized by topic, the same closed vocabulary
 * Practice/weak-areas already use (see docs/PHASE_16_LEARN_ARCHITECTURE_AUDIT.md
 * §7). Only ever shows topics with real published content — no 20-topic
 * placeholder grid (mission's own "do not fabricate content" rule).
 */
export function LearnLandingPage() {
  const [progress, setProgress] = useState<LearnProgressDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLearnProgress()
      .then(setProgress)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load Learn'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="dashboard-body">
      <PageHeader title="Learn" subtitle="Structured lessons for each topic, connected straight into Practice." />

      {error && <ErrorState message={error} />}

      {loading ? (
        <div className="card">
          <Skeleton height="4rem" />
        </div>
      ) : progress && progress.byTopic.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<BookOpen size={22} />}
            title="No lessons published yet"
            description="Your instructor hasn't published any Learn content yet. In the meantime, you can start practicing right away."
            action={
              <Link to="/student/practice/problems">
                <button className="btn-icon">Browse problems</button>
              </Link>
            }
          />
        </div>
      ) : (
        progress && (
          <>
            {progress.continueLesson && (
              <Link
                to={`/student/learn/${encodeURIComponent(progress.continueLesson.topic)}/lessons/${progress.continueLesson.lessonId}`}
                className="continue-card"
                style={{ textDecoration: 'none' }}
              >
                <div>
                  <p className="continue-card-label">Continue learning</p>
                  <p className="continue-card-title">{progress.continueLesson.title}</p>
                  <p className="continue-card-meta">{progress.continueLesson.topic}</p>
                </div>
                <button type="button" className="btn-icon btn-on-accent">
                  Continue <ArrowRight size={15} />
                </button>
              </Link>
            )}

            {/* Honest completion state (§P1-A, Phase 17) — only every topic that
                currently HAS lessons is counted as "available"; this never implies
                the full CODING_TOPICS catalog is covered, since most of it isn't yet. */}
            {!progress.continueLesson && progress.totalLessons > 0 && progress.completedLessons === progress.totalLessons && (
              <div className="practice-completion">
                <div className="practice-completion-head">
                  <PartyPopper size={22} />
                  <div>
                    <p className="practice-completion-eyebrow">You're caught up</p>
                    <p className="practice-completion-title">You've completed every published lesson</p>
                    <p className="practice-completion-meta">
                      {progress.byTopic.length} of {CODING_TOPICS.length} topics have lessons so far — more will appear
                      here as they're published.
                    </p>
                  </div>
                </div>
                <div className="practice-completion-actions">
                  <Link to="/student/practice/problems" className="btn-icon btn-on-accent" style={{ textDecoration: 'none' }}>
                    Keep practicing <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            )}

            <div className="stat-card-grid" style={{ marginBottom: 'var(--space-6)' }}>
              <div className="stat-card">
                <div>
                  <p className="stat-card-label">Lessons completed</p>
                  <div className="stat-card-value">
                    {progress.completedLessons} / {progress.totalLessons}
                  </div>
                </div>
                <div className="stat-card-icon">
                  <CheckCircle2 size={18} />
                </div>
              </div>
            </div>

            <div className="section-title-row" style={{ marginTop: 0 }}>
              <h2>Topics</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.85rem' }}>
              {progress.byTopic.map((t) => {
                const pct = t.total > 0 ? Math.round((t.completed / t.total) * 100) : 0;
                return (
                  <Link
                    key={t.topic}
                    to={`/student/learn/${encodeURIComponent(t.topic)}`}
                    className="card"
                    style={{ textDecoration: 'none', color: 'inherit', padding: '1rem 1.1rem', margin: 0 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                      <strong>{t.topic}</strong>
                      <span style={{ fontSize: 'var(--text-small)', color: 'var(--color-muted)' }}>
                        {t.completed}/{t.total}
                      </span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )
      )}
    </div>
  );
}
