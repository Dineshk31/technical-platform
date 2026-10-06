import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { ApiError } from '../../lib/api-client';
import { getStudentLesson, type StudentLessonDetail } from '../../lib/learn-api';
import type { PracticeQuestionDetail } from '../../lib/practice-api';
import { Markdown } from '../../components/Markdown';
import { LoadingRow } from '../../components/Skeleton';

type RelatedLesson = PracticeQuestionDetail['relatedLessons'][number];

/**
 * "Stuck? Read the concept" — the lesson rendered inside the problem panel, so the
 * editor (and the code in it) never unmounts. Knowledge checks stay on the full lesson
 * page, which opens in a new tab: here the student only needs the explanation.
 */
export function WorkspaceLessonPanel({ lessons }: { lessons: RelatedLesson[] }) {
  const [selectedId, setSelectedId] = useState(lessons[0]?.id);
  const [loaded, setLoaded] = useState<StudentLessonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = lessons.find((l) => l.id === selectedId) ?? lessons[0];
  const lesson = loaded?.id === selected?.id ? loaded : null;

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    getStudentLesson(selected.id)
      .then((l) => {
        if (!cancelled) {
          setLoaded(l);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError && err.status === 404 ? 'This lesson is no longer available.' : 'Failed to load the lesson.');
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  if (!selected) return null;

  return (
    <div className="workspace-lesson">
      {lessons.length > 1 && (
        <div className="workspace-lesson-picker" role="group" aria-label="Related lessons">
          {lessons.map((l) => (
            <button
              key={l.id}
              type="button"
              className={l.id === selected.id ? 'btn-small' : 'btn-secondary btn-small'}
              aria-pressed={l.id === selected.id}
              onClick={() => setSelectedId(l.id)}
            >
              {l.title}
            </button>
          ))}
        </div>
      )}

      <p className="lesson-eyebrow">
        {selected.topic} · {selected.reason === 'ATTACHED' ? 'Lesson for this problem' : 'Topic introduction'}
      </p>
      <h2 style={{ margin: '0 0 0.35rem' }}>{selected.title}</h2>
      <p className="workspace-lesson-note">
        Your code stays in the editor and is saved automatically.{' '}
        <a href={`/student/learn/${encodeURIComponent(selected.topic)}/lessons/${selected.id}`} target="_blank" rel="noopener noreferrer">
          Open the full lesson with its knowledge checks <ExternalLink size={12} aria-hidden="true" />
        </a>
      </p>

      {error && <p className="form-error">{error}</p>}
      {!lesson && !error && <LoadingRow label="Loading lesson…" />}
      {lesson && (
        <>
          {lesson.objectives.length > 0 && (
            <ul className="workspace-lesson-objectives">
              {lesson.objectives.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          )}
          <Markdown>{lesson.concept}</Markdown>
          {lesson.example && (
            <>
              <h3>Worked example</h3>
              <Markdown>{lesson.example}</Markdown>
            </>
          )}
          {lesson.commonMistakes && (
            <>
              <h3>Common mistakes</h3>
              <Markdown>{lesson.commonMistakes}</Markdown>
            </>
          )}
        </>
      )}
    </div>
  );
}
