import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, Code2, History, ListChecks, Target } from 'lucide-react';
import { ApiError } from '../lib/api-client';
import { useAuth } from '../context/AuthContext';
import { listAssignedAssessments, type StudentAssignedListItem } from '../lib/assessments-api';
import { groupStudentAssessments } from '../lib/assessment-groups';
import { getPracticeProgress, type PracticeProgressDto } from '../lib/practice-api';
import { getLearnProgress, type LearnProgressDto } from '../lib/learn-api';
import { resolveWeakAreas } from '../lib/weak-areas';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/Card';
import { AssessmentRow } from '../components/AssessmentRow';
import { WeakAreasCard } from '../components/WeakAreasCard';
import { DifficultyBadge } from '../components/ApprovalBadge';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';
import { statusPillClass, VERDICT_LABELS } from '../lib/verdict';

const DIFFICULTY_ORDER = ['EASY', 'MEDIUM', 'HARD'];

interface ContinueAction {
  label: string;
  title: string;
  meta: string;
  to: string;
  cta: string;
}

/**
 * The one place "what should I do next" is decided — a real, deterministic
 * waterfall over actual state, never an invented recommendation (see
 * docs/PRODUCT_TRANSFORMATION_AUDIT.md §5 P0-A). Priority: a truly live,
 * already-started assessment (time-sensitive) > a live assessment not yet
 * started > whichever of {continue practicing, continue learning} the
 * student touched more recently (see docs/PHASE_16_LEARN_ARCHITECTURE_AUDIT.md
 * §9 — a real recency comparison, not a fixed Learn-before-Practice pillar
 * order) > a first-time nudge into Practice > a generic "keep going" for an
 * experienced student with nothing specifically unfinished.
 */
function resolveContinueAction(
  assessments: StudentAssignedListItem[],
  progress: PracticeProgressDto | null,
  learnProgress: LearnProgressDto | null,
): ContinueAction | null {
  const activeStarted = assessments.find(
    (a) => a.status === 'ACTIVE' && a.hasStarted && a.attemptId && a.attemptStatus === 'IN_PROGRESS',
  );
  if (activeStarted) {
    return {
      label: 'Assessment in progress',
      title: activeStarted.title,
      meta: `Window closes ${new Date(activeStarted.endAt).toLocaleString()}`,
      to: `/student/attempts/${activeStarted.attemptId}`,
      cta: 'Resume assessment',
    };
  }

  const activeUnstarted = assessments.find((a) => a.status === 'ACTIVE' && !a.hasStarted);
  if (activeUnstarted) {
    return {
      label: 'Assessment available now',
      title: activeUnstarted.title,
      meta: `Window closes ${new Date(activeUnstarted.endAt).toLocaleString()}`,
      to: `/student/assessments/${activeUnstarted.id}`,
      cta: 'Start assessment',
    };
  }

  const practiceCandidate = progress?.continueQuestion
    ? {
        at: new Date(progress.continueQuestion.lastActivityAt).getTime(),
        action: {
          label: 'Continue practicing',
          title: progress.continueQuestion.title,
          meta: `${progress.continueQuestion.difficulty} · ${progress.continueQuestion.language}`,
          to: `/student/practice/problems/${progress.continueQuestion.questionId}`,
          cta: 'Continue problem',
        } satisfies ContinueAction,
      }
    : null;
  const learnCandidate = learnProgress?.continueLesson
    ? {
        at: new Date(learnProgress.continueLesson.lastActivityAt).getTime(),
        action: {
          label: 'Continue learning',
          title: learnProgress.continueLesson.title,
          meta: learnProgress.continueLesson.topic,
          to: `/student/learn/${encodeURIComponent(learnProgress.continueLesson.topic)}/lessons/${learnProgress.continueLesson.lessonId}`,
          cta: 'Continue lesson',
        } satisfies ContinueAction,
      }
    : null;
  const mostRecent = [practiceCandidate, learnCandidate]
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => b.at - a.at)[0];
  if (mostRecent) return mostRecent.action;

  if (progress && progress.solved === 0) {
    return {
      label: 'Get started',
      title: 'Solve your first problem',
      meta: `${progress.totalProblems} problems available`,
      to: '/student/practice/problems',
      cta: 'Start practicing',
    };
  }

  if (progress) {
    return {
      label: 'Keep going',
      title: 'Browse more problems',
      meta: `${progress.solved}/${progress.totalProblems} solved so far`,
      to: '/student/practice/problems',
      cta: 'Browse problems',
    };
  }

  return null;
}

export function StudentHomePage() {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState<StudentAssignedListItem[]>([]);
  const [progress, setProgress] = useState<PracticeProgressDto | null>(null);
  const [learnProgress, setLearnProgress] = useState<LearnProgressDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listAssignedAssessments(), getPracticeProgress(), getLearnProgress()])
      .then(([a, p, l]) => {
        setAssessments(a.data);
        setProgress(p);
        setLearnProgress(l);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load your dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const firstName = user?.name?.split(' ')[0];
  const continueAction = resolveContinueAction(assessments, progress, learnProgress);

  const { activeInProgress, activeNotStarted, activeAwaitingResults, upcoming, completed } =
    groupStudentAssessments(assessments);

  const byDifficulty = progress
    ? [...progress.byDifficulty].sort((a, b) => DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty))
    : [];
  const remaining = progress ? Math.max(0, progress.totalProblems - progress.solved - progress.attempted) : 0;
  const weakAreas = progress ? resolveWeakAreas(progress.byTopic) : [];
  const topicsWithLessons = learnProgress ? new Set(learnProgress.byTopic.map((t) => t.topic)) : undefined;

  return (
    <div className="dashboard-body">
      <PageHeader title={firstName ? `Welcome back, ${firstName}` : 'Home'} subtitle="Here's what's happening in your account." />

      {error && <ErrorState message={error} />}

      {loading ? (
        <div className="card">
          <Skeleton height="4rem" />
        </div>
      ) : (
        <>
          {continueAction && (
            <Link to={continueAction.to} className="continue-card" style={{ textDecoration: 'none' }}>
              <div>
                <p className="continue-card-label">{continueAction.label}</p>
                <p className="continue-card-title">{continueAction.title}</p>
                <p className="continue-card-meta">{continueAction.meta}</p>
              </div>
              <button type="button" className="btn-icon btn-on-accent">
                {continueAction.cta} <ArrowRight size={15} />
              </button>
            </Link>
          )}

          <div className="section-title-row" style={{ marginTop: 0 }}>
            <h2>Practice progress</h2>
            <Link to="/student/practice" className="section-title-link">
              View practice hub →
            </Link>
          </div>
          {progress && (
            <>
              <div className="stat-card-grid">
                <StatCard label="Total problems" value={progress.totalProblems} icon={<ListChecks size={18} />} />
                <StatCard
                  label="Solved"
                  value={progress.solved}
                  hint={progress.totalProblems > 0 ? `${Math.round((progress.solved / progress.totalProblems) * 100)}%` : undefined}
                  icon={<Code2 size={18} />}
                />
                <StatCard label="Attempted" value={progress.attempted} hint="Not yet solved" icon={<Target size={18} />} />
                <StatCard label="Remaining" value={remaining} hint="Not started yet" icon={<Code2 size={18} />} />
              </div>
              {byDifficulty.length > 0 && (
                <div className="card">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {byDifficulty.map((d) => {
                      const pct = d.total > 0 ? Math.round((d.solved / d.total) * 100) : 0;
                      return (
                        <div key={d.difficulty}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                            <strong>{d.difficulty}</strong>
                            <span style={{ color: 'var(--color-muted)' }}>
                              {d.solved}/{d.total} solved
                            </span>
                          </div>
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {weakAreas.length > 0 && (
            <div style={{ marginTop: 'var(--space-6)' }}>
              <WeakAreasCard areas={weakAreas} topicsWithLessons={topicsWithLessons} />
            </div>
          )}

          <div className="section-title-row">
            <h2>Assessments</h2>
            {assessments.length > 0 && (
              <Link to="/student/assessments" className="section-title-link">
                View all assessments →
              </Link>
            )}
          </div>
          <div className="card">
            {assessments.length === 0 ? (
              <EmptyState
                icon={<CalendarClock size={22} />}
                title="No assessments assigned yet"
                description="When your instructor assigns you a technical assessment, it will show up here. In the meantime, you can start practicing right away — no assignment needed."
                action={
                  <Link to="/student/practice/problems">
                    <button className="btn-icon">
                      <Code2 size={15} /> Start practicing
                    </button>
                  </Link>
                }
              />
            ) : (
              <>
                {activeInProgress.length > 0 && (
                  <>
                    <div className="assessment-group-title">In progress</div>
                    {activeInProgress.map((a) => (
                      <AssessmentRow key={a.id} assessment={a} />
                    ))}
                  </>
                )}
                {activeNotStarted.length > 0 && (
                  <>
                    <div className="assessment-group-title">Available now</div>
                    {activeNotStarted.map((a) => (
                      <AssessmentRow key={a.id} assessment={a} />
                    ))}
                  </>
                )}
                {activeAwaitingResults.length > 0 && (
                  <>
                    <div className="assessment-group-title">Submitted — awaiting results</div>
                    {activeAwaitingResults.map((a) => (
                      <AssessmentRow key={a.id} assessment={a} />
                    ))}
                  </>
                )}
                {upcoming.length > 0 && (
                  <>
                    <div className="assessment-group-title">Upcoming</div>
                    {upcoming.map((a) => (
                      <AssessmentRow key={a.id} assessment={a} />
                    ))}
                  </>
                )}
                {completed.length > 0 && (
                  <>
                    <div className="assessment-group-title">Completed</div>
                    {completed.map((a) => (
                      <AssessmentRow key={a.id} assessment={a} />
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          {progress && progress.recentActivity.length > 0 && (
            <>
              <div className="section-title-row">
                <h2>Recent practice activity</h2>
              </div>
              <div className="card">
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
            </>
          )}
        </>
      )}
    </div>
  );
}
