import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Code2, ListChecks, Target } from 'lucide-react';
import { ApiError } from '../lib/api-client';
import {
  completeLesson,
  getStudentLesson,
  listTopicLessons,
  type LessonCheckAnswerResult,
  type StudentLessonDetail,
  type StudentLessonListItem,
} from '../lib/learn-api';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';
import { Markdown } from '../components/Markdown';
import { KnowledgeCheckCard } from '../components/KnowledgeCheckCard';

const PRACTICE_STATUS: Record<string, { label: string; pill: string }> = {
  SOLVED: { label: 'Solved', pill: 'pass' },
  ATTEMPTED: { label: 'Attempted', pill: 'pending' },
  NOT_ATTEMPTED: { label: 'Not started', pill: 'pending' },
};

/**
 * The lesson experience (§P16-C, Phase 18): what you'll learn → the content (safe
 * Markdown with highlighted code) → a server-graded knowledge check → a real
 * completion moment → "Practice what you just learned", the specific problems the
 * author attached, each with this student's own solved status. A lesson without
 * checks keeps the plain "Mark complete" step.
 */
export function LearnLessonPage() {
  const { topic, id } = useParams<{ topic: string; id: string }>();
  const navigate = useNavigate();

  const [lesson, setLesson] = useState<StudentLessonDetail | null>(null);
  const [siblings, setSiblings] = useState<StudentLessonListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (!id || !topic) return;
    setLoading(true);
    setError(null);
    Promise.all([getStudentLesson(id), listTopicLessons(topic)])
      .then(([l, list]) => {
        setLesson(l);
        setSiblings(list);
      })
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? 'Lesson not found' : 'Failed to load this lesson'))
      .finally(() => setLoading(false));
  }, [id, topic]);

  async function handleComplete() {
    if (!id || completing) return;
    setActionError(null);
    setCompleting(true);
    try {
      await completeLesson(id);
      setLesson((prev) => (prev ? { ...prev, completed: true } : prev));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to mark this lesson complete');
    } finally {
      setCompleting(false);
    }
  }

  function handleAnswered(result: LessonCheckAnswerResult) {
    setLesson((prev) =>
      prev
        ? {
            ...prev,
            completed: prev.completed || result.lessonCompleted,
            checksPassed: result.checksPassed,
            checks: prev.checks.map((c) =>
              c.questionId === result.questionId
                ? {
                    ...c,
                    answer: {
                      selectedOptionIds: result.selectedOptionIds,
                      isCorrect: result.isCorrect,
                      attemptCount: result.attemptCount,
                      explanation: result.explanation,
                    },
                  }
                : c,
            ),
          }
        : prev,
    );
  }

  if (loading) {
    return (
      <div className="dashboard-body">
        <Skeleton height="2rem" />
        <Skeleton height="12rem" />
      </div>
    );
  }
  if (error || !lesson || !topic) {
    return (
      <div className="dashboard-body">
        <Link to={topic ? `/student/learn/${encodeURIComponent(topic)}` : '/student/learn'} className="back-link">
          <ArrowLeft size={14} /> Back
        </Link>
        <ErrorState message={error ?? 'Lesson not found'} />
      </div>
    );
  }

  const orderedSiblings = [...siblings].sort((a, b) => a.orderIndex - b.orderIndex);
  const currentIndex = orderedSiblings.findIndex((l) => l.id === lesson.id);
  const nextLesson = currentIndex >= 0 ? orderedSiblings[currentIndex + 1] : undefined;
  const hasChecks = lesson.checksTotal > 0;
  const firstUnsolved = lesson.practice.find((p) => p.status !== 'SOLVED');
  const checkPct = hasChecks ? Math.round((lesson.checksPassed / lesson.checksTotal) * 100) : 0;

  return (
    <div className="dashboard-body lesson-page">
      <Link to={`/student/learn/${encodeURIComponent(topic)}`} className="back-link">
        <ArrowLeft size={14} /> {topic}
      </Link>

      <header className="lesson-header">
        {currentIndex >= 0 && (
          <p className="lesson-eyebrow">
            {topic} · Lesson {currentIndex + 1} of {orderedSiblings.length}
          </p>
        )}
        <h1 style={{ margin: 0 }}>{lesson.title}</h1>
        <p className="lesson-summary">{lesson.summary}</p>
      </header>

      {lesson.objectives.length > 0 && (
        <section className="card lesson-objectives" aria-labelledby="objectives-heading">
          <h2 id="objectives-heading" className="lesson-section-title">
            <Target size={17} aria-hidden="true" /> What you'll learn
          </h2>
          <ul>
            {lesson.objectives.map((o) => (
              <li key={o}>
                <CheckCircle2 size={15} aria-hidden="true" />
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <article className="card lesson-content">
        <Markdown>{lesson.concept}</Markdown>
        {lesson.example && (
          <>
            <h2 className="lesson-section-title">Worked example</h2>
            <Markdown>{lesson.example}</Markdown>
          </>
        )}
        {lesson.commonMistakes && (
          <>
            <h2 className="lesson-section-title">Common mistakes</h2>
            <Markdown>{lesson.commonMistakes}</Markdown>
          </>
        )}
      </article>

      {hasChecks && (
        <section className="card" aria-labelledby="check-heading">
          <div className="page-header" style={{ marginBottom: '0.35rem' }}>
            <h2 id="check-heading" className="lesson-section-title" style={{ margin: 0 }}>
              <ListChecks size={17} aria-hidden="true" /> Check your understanding
            </h2>
            <span className={`exam-status-pill ${lesson.completed ? 'pass' : 'pending'}`}>
              {lesson.checksPassed}/{lesson.checksTotal} correct
            </span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Knowledge check progress"
            aria-valuenow={checkPct}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{ marginBottom: '0.9rem' }}
          >
            <div className="progress-fill" style={{ width: `${checkPct}%` }} />
          </div>
          {!lesson.completed && (
            <p className="field-hint" style={{ marginTop: 0 }}>
              Answer every question correctly to complete this lesson. You can try again as many times as you need.
            </p>
          )}
          <div className="kc-list">
            {lesson.checks.map((c, i) => (
              <KnowledgeCheckCard key={c.questionId} lessonId={lesson.id} check={c} index={i} onAnswered={handleAnswered} />
            ))}
          </div>
        </section>
      )}

      {!lesson.completed && !hasChecks && (
        <div className="card" style={{ textAlign: 'center' }}>
          <button className="btn-icon" onClick={() => void handleComplete()} disabled={completing}>
            <CheckCircle2 size={15} /> {completing ? 'Marking complete…' : 'Mark complete'}
          </button>
          {actionError && <p className="form-error">{actionError}</p>}
        </div>
      )}

      {lesson.completed && (
        <div className="practice-completion" role="status">
          <div className="practice-completion-head">
            <CheckCircle2 size={28} aria-hidden="true" />
            <div>
              <p className="practice-completion-eyebrow">Lesson completed</p>
              <p className="practice-completion-title">{lesson.title}</p>
              <p className="practice-completion-meta">
                {hasChecks ? `All ${lesson.checksTotal} knowledge checks answered correctly` : topic}
              </p>
            </div>
          </div>
          <div className="practice-completion-actions">
            {firstUnsolved ? (
              <Link to={`/student/practice/problems/${firstUnsolved.questionId}`}>
                <button type="button" className="btn-on-accent btn-icon">
                  <Code2 size={15} /> Solve {firstUnsolved.title} <ArrowRight size={15} />
                </button>
              </Link>
            ) : (
              lesson.practice.length === 0 && (
                <Link to={`/student/practice/problems?topic=${encodeURIComponent(topic)}`}>
                  <button type="button" className="btn-on-accent btn-icon">
                    <Code2 size={15} /> Practice {topic} problems <ArrowRight size={15} />
                  </button>
                </Link>
              )
            )}
            {nextLesson && (
              <button
                type="button"
                className="btn-secondary btn-small btn-icon practice-completion-secondary"
                onClick={() => navigate(`/student/learn/${encodeURIComponent(topic)}/lessons/${nextLesson.id}`)}
              >
                Next lesson: {nextLesson.title} <ArrowRight size={13} />
              </button>
            )}
            <Link to={`/student/learn/${encodeURIComponent(topic)}`}>
              <button type="button" className="btn-secondary btn-small btn-icon practice-completion-secondary">
                Back to {topic}
              </button>
            </Link>
          </div>
        </div>
      )}

      {lesson.completed && lesson.practice.length > 0 && (
        <section className="card" aria-labelledby="practice-heading">
          <h2 id="practice-heading" className="lesson-section-title">
            <Code2 size={17} aria-hidden="true" /> Practice what you just learned
          </h2>
          <p className="field-hint" style={{ marginTop: 0 }}>
            Picked for this lesson. Your code is judged against hidden tests, just like in an assessment.
          </p>
          <div className="activity-list">
            {lesson.practice.map((p) => (
              <Link
                key={p.questionId}
                to={`/student/practice/problems/${p.questionId}`}
                className="activity-row"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="activity-row-main">
                  <span className="activity-row-title">{p.title}</span>
                  <span className="activity-row-meta">{p.difficulty}</span>
                </div>
                <span className={`exam-status-pill ${PRACTICE_STATUS[p.status].pill}`}>{PRACTICE_STATUS[p.status].label}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
