import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Code2, ListChecks, Target } from 'lucide-react';
import { ApiError } from '../lib/api-client';
import { getPracticeProgress, type PracticeProgressDto } from '../lib/practice-api';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';

const DIFFICULTY_ORDER = ['EASY', 'MEDIUM', 'HARD'];

export function PracticeLandingPage() {
  const [progress, setProgress] = useState<PracticeProgressDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPracticeProgress()
      .then(setProgress)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load your practice progress'))
      .finally(() => setLoading(false));
  }, []);

  const remaining = progress ? progress.totalProblems - progress.solved - progress.attempted : 0;
  const solvedPct = progress && progress.totalProblems > 0 ? Math.round((progress.solved / progress.totalProblems) * 100) : 0;
  const byDifficulty = progress
    ? [...progress.byDifficulty].sort((a, b) => DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty))
    : [];

  return (
    <div className="dashboard-body">
      <PageHeader
        title="Practice"
        subtitle="Sharpen your problem-solving with real coding problems — run, submit, and track your progress."
        actions={
          <Link to="/student/practice/problems">
            <button className="btn-icon">
              <Code2 size={15} /> Browse problems
            </button>
          </Link>
        }
      />

      {error && <ErrorState message={error} />}

      {loading ? (
        <div className="stat-card-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card">
              <Skeleton height="2.2rem" />
            </div>
          ))}
        </div>
      ) : (
        progress && (
          <>
            <div className="stat-card-grid">
              <StatCard label="Total problems" value={progress.totalProblems} icon={<ListChecks size={18} />} />
              <StatCard
                label="Solved"
                value={progress.solved}
                hint={`${solvedPct}% of all problems`}
                icon={<CheckCircle2 size={18} />}
              />
              <StatCard label="Attempted" value={progress.attempted} hint="Not yet solved" icon={<Target size={18} />} />
              <StatCard label="Remaining" value={Math.max(0, remaining)} hint="Not started yet" icon={<Code2 size={18} />} />
            </div>

            <div className="card">
              <div className="page-header" style={{ marginBottom: '1rem' }}>
                <h2 style={{ margin: 0 }}>Progress by difficulty</h2>
              </div>
              {byDifficulty.length === 0 ? (
                <p style={{ color: 'var(--color-muted)' }}>No approved practice problems are available yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {byDifficulty.map((d) => {
                    const pct = d.total > 0 ? Math.round((d.solved / d.total) * 100) : 0;
                    return (
                      <div key={d.difficulty}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                          <strong>{d.difficulty}</strong>
                          <span style={{ color: 'var(--color-muted)' }}>
                            {d.solved} solved · {d.attempted} attempted · {d.total} total
                          </span>
                        </div>
                        <div className="progress-track">
                          <div className="progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}
