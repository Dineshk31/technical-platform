import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Code2 } from 'lucide-react';
import { ApiError } from '../lib/api-client';
import { listTopicLessons, type StudentLessonListItem } from '../lib/learn-api';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';

/** One topic's ordered lesson list (§P16-C) — the "Practice this topic" CTA
 * reuses the exact same Explorer deep-link pattern already proven live by
 * the weak-area cards (?topic=<topic>). */
export function LearnTopicPage() {
  const { topic } = useParams<{ topic: string }>();
  const [lessons, setLessons] = useState<StudentLessonListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!topic) return;
    listTopicLessons(topic)
      .then(setLessons)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load this topic'))
      .finally(() => setLoading(false));
  }, [topic]);

  const completed = lessons.filter((l) => l.completed).length;

  return (
    <div className="dashboard-body">
      <Link to="/student/learn" className="back-link">
        <ArrowLeft size={14} /> Back to Learn
      </Link>

      <PageHeader
        title={topic ?? 'Topic'}
        subtitle={!loading ? `${completed}/${lessons.length} lessons completed` : undefined}
        actions={
          topic && (
            <Link to={`/student/practice/problems?topic=${encodeURIComponent(topic)}`}>
              <button className="btn-secondary btn-icon">
                <Code2 size={15} /> Practice {topic} problems
              </button>
            </Link>
          )
        }
      />

      {error && <ErrorState message={error} />}

      <div className="card">
        {loading ? (
          <Skeleton height="3rem" />
        ) : lessons.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={22} />} title="No lessons published for this topic yet" />
        ) : (
          <div className="activity-list">
            {lessons.map((l) => (
              <Link
                key={l.id}
                to={`/student/learn/${encodeURIComponent(l.topic)}/lessons/${l.id}`}
                className="activity-row"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="activity-row-main">
                  {l.completed ? (
                    <CheckCircle2 size={16} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 16, height: 16, flexShrink: 0 }} />
                  )}
                  <div>
                    <span className="activity-row-title" style={{ display: 'block' }}>
                      {l.title}
                    </span>
                    <span style={{ fontSize: 'var(--text-label)', color: 'var(--color-muted)' }}>{l.summary}</span>
                  </div>
                </div>
                <span className={`exam-status-pill ${l.completed ? 'pass' : 'pending'}`}>
                  {l.completed ? 'Completed' : 'Not started'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
