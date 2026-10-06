import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowRight, CheckCircle2, Code2, ListChecks } from 'lucide-react';
import { groupByPracticeTier } from '@technical-platform/shared';
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
import { LessonBody } from '../components/LessonBody';
import { KnowledgeCheckCard } from '../components/KnowledgeCheckCard';

const PRACTICE_STATUS: Record<string, { label: string; pill: string }> = {
  SOLVED: { label: 'Solved', pill: 'pass' },
  ATTEMPTED: { label: 'Attempted', pill: 'pending' },
  NOT_ATTEMPTED: { label: 'Not started', pill: 'pending' },
};

const WORDS_PER_MINUTE = 200;

function readingMinutes(lesson: StudentLessonDetail): number {
  const text = [lesson.concept, lesson.example ?? '', lesson.commonMistakes ?? ''].join(' ');
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / WORDS_PER_MINUTE));
}

const lessonPath = (l: { topic: string; id: string }) => `/student/learn/${encodeURIComponent(l.topic)}/lessons/${l.id}`;

/**
 * The lesson experience: what you'll learn → the content (safe Markdown with highlighted
 * code) → an optional, server-graded knowledge check → the practice problems the author
 * attached. Practice is always visible and grouped from easiest to hardest — a lesson is
 * a companion to coding, never a gate in front of it, so nothing here waits for the
 * checks to be passed. Previous/next lesson links are always available.
 */
export function LearnLessonPage() {
  const { topic, id } = useParams<{ topic: string; id: string }>();

  const [lesson, setLesson] = useState<StudentLessonDetail | null>(null);
  const [siblings, setSiblings] = useState<StudentLessonListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id || !topic) return;
    setLoading(true);
    setError(null);
    Promise.all([getStudentLesson(id), listTopicLessons(topic)])
      .then(([l, list]) => {
        setLesson(l);
        setSiblings(list);
        // The app shell scrolls its own content area, not the window — start each lesson at the top.
        rootRef.current?.closest('.app-main-scroll')?.scrollTo({ top: 0 });
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
      <div className="dashboard-body lesson-page" ref={rootRef}>
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
  const previousLesson = currentIndex > 0 ? orderedSiblings[currentIndex - 1] : undefined;
  const nextLesson = currentIndex >= 0 ? orderedSiblings[currentIndex + 1] : undefined;
  const hasChecks = lesson.checksTotal > 0;
  const hasPractice = lesson.practice.length > 0;
  const firstUnsolved = lesson.practice.find((p) => p.status !== 'SOLVED');
  const checkPct = hasChecks ? Math.round((lesson.checksPassed / lesson.checksTotal) * 100) : 0;
  const topicProblemsPath = `/student/practice/problems?topic=${encodeURIComponent(topic)}`;

  return (
    <div className="dashboard-body lesson-page" ref={rootRef}>
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
        <div className="lesson-meta">
          <span>{readingMinutes(lesson)} min read</span>
          {hasChecks && (
            <span>
              {lesson.checksTotal} knowledge check{lesson.checksTotal === 1 ? '' : 's'}
            </span>
          )}
          {lesson.completed && (
            <span className="lesson-meta-done">
              <CheckCircle2 size={13} aria-hidden="true" /> Completed
            </span>
          )}
          <a href="#practice-heading" className="lesson-meta-jump">
            <ArrowDown size={13} aria-hidden="true" />
            {hasPractice ? `Skip to practice (${lesson.practice.length})` : 'Skip to practice'}
          </a>
        </div>
      </header>

      <LessonBody objectives={lesson.objectives} concept={lesson.concept} example={lesson.example} commonMistakes={lesson.commonMistakes} />

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
              Answer every question correctly to mark this lesson complete. Wrong answers can be retried, and the practice problems below
              are open whether or not you finish these.
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
            <Link to={firstUnsolved ? `/student/practice/problems/${firstUnsolved.questionId}` : topicProblemsPath}>
              <button type="button" className="btn-on-accent btn-icon">
                <Code2 size={15} /> {firstUnsolved ? `Solve ${firstUnsolved.title}` : `Practice ${topic} problems`} <ArrowRight size={15} />
              </button>
            </Link>
          </div>
        </div>
      )}

      <section className="card" aria-labelledby="practice-heading">
        <h2 id="practice-heading" className="lesson-section-title">
          <Code2 size={17} aria-hidden="true" /> Practice
        </h2>
        {hasPractice ? (
          <>
            <p className="field-hint" style={{ marginTop: 0 }}>
              Picked for this lesson, easiest first. Your code is judged against hidden tests, just like in an assessment.
            </p>
            {groupByPracticeTier(lesson.practice).map((group) => (
              <div key={group.tier} className="practice-tier">
                <h3 className="practice-tier-title">{group.label}</h3>
                <div className="activity-list">
                  {group.items.map((p) => (
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
              </div>
            ))}
          </>
        ) : (
          <p className="field-hint" style={{ marginTop: 0 }}>
            No problems are attached to this lesson yet.
          </p>
        )}
        <Link to={topicProblemsPath} className="lesson-more-link">
          All {topic} problems <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </section>

      {(previousLesson || nextLesson) && (
        <nav className="lesson-pager" aria-label="Lessons in this topic">
          {previousLesson ? (
            <Link to={lessonPath(previousLesson)} className="lesson-pager-link">
              <span className="lesson-pager-label">
                <ArrowLeft size={13} aria-hidden="true" /> Previous
              </span>
              <span className="lesson-pager-title">{previousLesson.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {nextLesson && (
            <Link to={lessonPath(nextLesson)} className="lesson-pager-link next">
              <span className="lesson-pager-label">
                Next <ArrowRight size={13} aria-hidden="true" />
              </span>
              <span className="lesson-pager-title">{nextLesson.title}</span>
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
