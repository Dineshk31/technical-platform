import { Link } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import type { WeakArea } from '../lib/weak-areas';
import type { LearnTopicProgress } from '../lib/learn-api';

/**
 * Renders nothing when there's nothing real to show — never fabricates a "weak
 * area" just to fill space (see resolveWeakAreas' documented rule). Reuses the
 * same `.assessment-row` layout as the Assessments list rather than inventing a
 * new row shape for a third "list of things with a CTA" pattern.
 *
 * `lessonsByTopic` (optional — real data from LearnProgressDto.byTopic) adds a
 * "Learn" link that opens the topic's first unfinished lesson (Phase 18), or a
 * "Review" link once every lesson is done — never shown for a topic with no
 * published lessons.
 */
export function WeakAreasCard({ areas, lessonsByTopic }: { areas: WeakArea[]; lessonsByTopic?: Map<string, LearnTopicProgress> }) {
  if (areas.length === 0) return null;

  return (
    <div className="card">
      <div className="page-header" style={{ marginBottom: '0.5rem' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <TrendingUp size={17} /> Areas to improve
        </h2>
      </div>
      <p className="field-hint">Topics you've attempted but haven't solved a single problem in yet.</p>
      {areas.map((a) => (
        <div key={a.topic} className="assessment-row">
          <div>
            <p className="assessment-row-title">{a.topic}</p>
            <p className="assessment-row-meta">
              {a.solved} solved · {a.attempted} attempted · {a.total} problems total
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(() => {
              const learn = lessonsByTopic?.get(a.topic);
              if (!learn) return null;
              const to = learn.nextLessonId
                ? `/student/learn/${encodeURIComponent(a.topic)}/lessons/${learn.nextLessonId}`
                : `/student/learn/${encodeURIComponent(a.topic)}`;
              return (
                <Link to={to}>
                  <button className="btn-secondary btn-small">{learn.nextLessonId ? `Learn ${a.topic} first →` : `Review ${a.topic} →`}</button>
                </Link>
              );
            })()}
            <Link to={`/student/practice/problems?topic=${encodeURIComponent(a.topic)}`}>
              <button className="btn-secondary btn-small">Practice {a.topic} →</button>
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
