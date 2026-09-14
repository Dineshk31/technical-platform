import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Code2, History, ListChecks, Target } from 'lucide-react';
import { ApiError } from '../lib/api-client';
import { getPracticeProgress, type PracticeProgressDto } from '../lib/practice-api';
import { getLearnProgress, type LearnProgressDto } from '../lib/learn-api';
import { resolveWeakAreas } from '../lib/weak-areas';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/Card';
import { WeakAreasCard } from '../components/WeakAreasCard';
import { DifficultyBadge } from '../components/ApprovalBadge';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { statusPillClass, VERDICT_LABELS } from '../lib/verdict';

const DIFFICULTY_ORDER = ['EASY', 'MEDIUM', 'HARD'];
// How many topics to show before "Show all" — keeps the hub scannable when the
// question bank grows a long tail of lightly-used topics.
const TOPIC_PREVIEW_COUNT = 8;

export function PracticeLandingPage() {
  const [progress, setProgress] = useState<PracticeProgressDto | null>(null);
  const [learnProgress, setLearnProgress] = useState<LearnProgressDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllTopics, setShowAllTopics] = useState(false);

  useEffect(() => {
    Promise.all([getPracticeProgress(), getLearnProgress()])
      .then(([p, l]) => {
        setProgress(p);
        setLearnProgress(l);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load your practice progress'))
      .finally(() => setLoading(false));
  }, []);

  const remaining = progress ? progress.totalProblems - progress.solved - progress.attempted : 0;
  const solvedPct = progress && progress.totalProblems > 0 ? Math.round((progress.solved / progress.totalProblems) * 100) : 0;
  const byDifficulty = progress
    ? [...progress.byDifficulty].sort((a, b) => DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty))
    : [];
  const topicsToShow = progress ? (showAllTopics ? progress.byTopic : progress.byTopic.slice(0, TOPIC_PREVIEW_COUNT)) : [];
  const weakAreas = progress ? resolveWeakAreas(progress.byTopic) : [];
  const topicsWithLessons = learnProgress ? new Set(learnProgress.byTopic.map((t) => t.topic)) : undefined;

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
            {progress.continueQuestion && (
              <Link to={`/student/practice/problems/${progress.continueQuestion.questionId}`} className="continue-card" style={{ textDecoration: 'none' }}>
                <div>
                  <p className="continue-card-label">Continue solving</p>
                  <p className="continue-card-title">{progress.continueQuestion.title}</p>
                  <p className="continue-card-meta">
                    {progress.continueQuestion.difficulty} · {progress.continueQuestion.language}
                  </p>
                </div>
                <button type="button" className="btn-icon btn-on-accent">
                  Continue <ArrowRight size={15} />
                </button>
              </Link>
            )}

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
                <EmptyState
                  icon={<Code2 size={22} />}
                  title="No approved practice problems yet"
                  description="Once an admin approves coding questions, they'll show up here."
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {byDifficulty.map((d) => {
                    const pct = d.total > 0 ? Math.round((d.solved / d.total) * 100) : 0;
                    return (
                      <Link
                        key={d.difficulty}
                        to={`/student/practice/problems?difficulty=${d.difficulty}`}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                          <strong>{d.difficulty}</strong>
                          <span style={{ color: 'var(--color-muted)' }}>
                            {d.solved} solved · {d.attempted} attempted · {d.total} total
                          </span>
                        </div>
                        <div className="progress-track">
                          <div className="progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {weakAreas.length > 0 && <WeakAreasCard areas={weakAreas} topicsWithLessons={topicsWithLessons} />}

            {progress.byTopic.length > 0 && (
              <div className="card">
                <div className="page-header" style={{ marginBottom: '1rem' }}>
                  <h2 style={{ margin: 0 }}>Progress by topic</h2>
                  {progress.byTopic.length > TOPIC_PREVIEW_COUNT && (
                    <button type="button" className="btn-secondary btn-small" onClick={() => setShowAllTopics((v) => !v)}>
                      {showAllTopics ? 'Show less' : `Show all ${progress.byTopic.length}`}
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.85rem' }}>
                  {topicsToShow.map((t) => {
                    const pct = t.total > 0 ? Math.round((t.solved / t.total) * 100) : 0;
                    return (
                      <Link
                        key={t.topic}
                        to={`/student/practice/problems?topic=${encodeURIComponent(t.topic)}`}
                        className="card"
                        style={{ textDecoration: 'none', color: 'inherit', padding: '0.85rem 1rem', margin: 0 }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.35rem' }}>
                          <strong>{t.topic}</strong>
                          <span style={{ color: 'var(--color-muted)' }}>
                            {t.solved}/{t.total}
                          </span>
                        </div>
                        <div className="progress-track">
                          <div className="progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {progress.recentActivity.length > 0 && (
              <div className="card">
                <div className="page-header" style={{ marginBottom: '1rem' }}>
                  <h2 style={{ margin: 0 }}>Recent activity</h2>
                </div>
                <div className="activity-list">
                  {progress.recentActivity.map((item, i) => (
                    <Link
                      key={i}
                      to={`/student/practice/problems/${item.questionId}`}
                      className="activity-row"
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <div className="activity-row-main">
                        <History size={14} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
                        <span className="activity-row-title">{item.title}</span>
                        <DifficultyBadge difficulty={item.difficulty} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span className={`exam-status-pill ${statusPillClass(item.status)}`}>{VERDICT_LABELS[item.status]}</span>
                        <span className="activity-row-meta">{new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
