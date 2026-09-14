import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Code2 } from 'lucide-react';
import { ApiError } from '../lib/api-client';
import {
  completeLesson,
  getStudentLesson,
  listTopicLessons,
  type StudentLessonDetail,
  type StudentLessonListItem,
} from '../lib/learn-api';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';

/**
 * The lesson reading experience (§P16-C) — concept → example → common
 * mistakes, only the sections that actually have content (no empty
 * placeholder sections), then a real completion moment matching the
 * practice completion banner's visual family: a clear primary "Practice
 * this topic" action plus real, deterministic secondary navigation (next
 * lesson in this topic if one exists, back to the topic).
 */
export function LearnLessonPage() {
  const { topic, id } = useParams<{ topic: string; id: string }>();
  const navigate = useNavigate();

  const [lesson, setLesson] = useState<StudentLessonDetail | null>(null);
  const [siblings, setSiblings] = useState<StudentLessonListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    setCompleting(true);
    try {
      await completeLesson(id);
      setLesson((prev) => (prev ? { ...prev, completed: true } : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to mark this lesson complete');
    } finally {
      setCompleting(false);
    }
  }

  if (loading) {
    return (
      <div className="dashboard-body">
        <Skeleton height="2rem" />
      </div>
    );
  }
  if (error || !lesson || !topic) {
    return (
      <div className="dashboard-body">
        <ErrorState message={error ?? 'Lesson not found'} />
      </div>
    );
  }

  const orderedSiblings = [...siblings].sort((a, b) => a.orderIndex - b.orderIndex);
  const currentIndex = orderedSiblings.findIndex((l) => l.id === lesson.id);
  const nextLesson = currentIndex >= 0 ? orderedSiblings[currentIndex + 1] : undefined;

  return (
    <div className="dashboard-body">
      <Link to={`/student/learn/${encodeURIComponent(topic)}`} className="back-link">
        <ArrowLeft size={14} /> {topic}
      </Link>

      <div className="page-header">
        <h1 style={{ margin: 0 }}>{lesson.title}</h1>
      </div>
      <p style={{ color: 'var(--color-muted)' }}>{lesson.summary}</p>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Concept</h3>
        <p style={{ whiteSpace: 'pre-wrap' }}>{lesson.concept}</p>

        {lesson.example && (
          <>
            <h3>Example</h3>
            <pre className="example-block" style={{ whiteSpace: 'pre-wrap' }}>
              {lesson.example}
            </pre>
          </>
        )}

        {lesson.commonMistakes && (
          <>
            <h3>Common mistakes</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{lesson.commonMistakes}</p>
          </>
        )}
      </div>

      {!lesson.completed ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <button className="btn-icon" onClick={() => void handleComplete()} disabled={completing}>
            <CheckCircle2 size={15} /> {completing ? 'Marking complete…' : 'Mark complete'}
          </button>
        </div>
      ) : (
        <div className="practice-completion">
          <div className="practice-completion-head">
            <CheckCircle2 size={28} />
            <div>
              <p className="practice-completion-eyebrow">Lesson completed</p>
              <p className="practice-completion-title">{lesson.title}</p>
              <p className="practice-completion-meta">{topic}</p>
            </div>
          </div>
          <div className="practice-completion-actions">
            <Link to={`/student/practice/problems?topic=${encodeURIComponent(topic)}`}>
              <button type="button" className="btn-on-accent btn-icon">
                <Code2 size={15} /> Practice {topic} problems <ArrowRight size={15} />
              </button>
            </Link>
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
    </div>
  );
}
