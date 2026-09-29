import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { ApiError } from '../lib/api-client';
import { listQuestions, type QuestionListItem } from '../lib/questions-api';
import { VerificationBadge } from './VerificationPanel';

export interface PickedQuestion {
  questionId: string;
  title: string;
  difficulty: string;
  /** Set when a previously attached question no longer qualifies (the server will refuse it). */
  problem?: string;
}

/**
 * Deliberately attaches specific questions to a lesson (Phase 18) — never a topic
 * filter. `kind="CHECK"` offers approved MCQs as knowledge checks; `kind="PRACTICE"`
 * offers approved coding problems and only lets verified ones be added, showing why
 * the others can't. The server enforces the same rules; this just explains them.
 */
export function LessonQuestionPicker({
  kind,
  topic,
  picked,
  onChange,
  max = 10,
}: {
  kind: 'CHECK' | 'PRACTICE';
  topic: string;
  picked: PickedQuestion[];
  onChange: (next: PickedQuestion[]) => void;
  max?: number;
}) {
  const [candidates, setCandidates] = useState<QuestionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allTopics, setAllTopics] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listQuestions({
      type: kind === 'CHECK' ? 'MCQ' : 'CODING',
      approvalStatus: 'APPROVED',
      topic: allTopics ? undefined : topic,
      pageSize: 100,
      sort: 'easiest',
    })
      .then((r) => !cancelled && setCandidates(r.data))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Failed to load questions'));
    return () => {
      cancelled = true;
    };
  }, [kind, topic, allTopics]);

  const pickedIds = new Set(picked.map((p) => p.questionId));
  const available = (candidates ?? []).filter((q) => !pickedIds.has(q.id));
  const noun = kind === 'CHECK' ? 'approved MCQs' : 'approved coding problems';

  function move(index: number, delta: number) {
    const next = [...picked];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange(next);
  }

  return (
    <div>
      {picked.length === 0 ? (
        <p className="field-hint">None attached yet.</p>
      ) : (
        <ol className="picked-list">
          {picked.map((p, i) => (
            <li key={p.questionId} className={p.problem ? 'picked-item has-problem' : 'picked-item'}>
              <div style={{ minWidth: 0 }}>
                <span className="activity-row-title">{p.title}</span>
                <span className="activity-row-meta"> · {p.difficulty}</span>
                {p.problem && <p className="form-error" style={{ margin: '0.2rem 0 0' }}>{p.problem}</p>}
              </div>
              <div className="picked-actions">
                <button type="button" className="btn-secondary btn-small" aria-label={`Move ${p.title} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp size={13} />
                </button>
                <button type="button" className="btn-secondary btn-small" aria-label={`Move ${p.title} down`} disabled={i === picked.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown size={13} />
                </button>
                <button type="button" className="btn-secondary btn-small" aria-label={`Remove ${p.title}`} onClick={() => onChange(picked.filter((x) => x.questionId !== p.questionId))}>
                  <X size={13} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="picker-toolbar">
        <span className="field-hint" style={{ margin: 0 }}>
          Add from {noun} {allTopics ? 'in any topic' : `tagged ${topic}`}
        </span>
        <label className="checkbox-row" style={{ margin: 0, fontWeight: 400 }}>
          <input type="checkbox" checked={allTopics} onChange={(e) => setAllTopics(e.target.checked)} /> Show all topics
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
      {!candidates && !error && <p className="field-hint">Loading…</p>}
      {candidates && available.length === 0 && (
        <p className="field-hint">
          No other {noun} {allTopics ? '' : `tagged ${topic} `}yet
          {kind === 'CHECK' ? ' — create and approve an MCQ in the Question Bank first.' : ' — create, verify and approve one in the Question Bank first.'}
        </p>
      )}
      {available.length > 0 && (
        <div className="picker-candidates">
          {available.map((q) => {
            const blocked = kind === 'PRACTICE' && q.verificationStatus !== 'PASSED';
            return (
              <div key={q.id} className="picker-candidate">
                <div style={{ minWidth: 0 }}>
                  <span>{q.title}</span>
                  <span className="activity-row-meta"> · {q.difficulty}</span>
                  {kind === 'PRACTICE' && q.verificationStatus && (
                    <span style={{ marginLeft: '0.4rem' }}>
                      <VerificationBadge status={q.verificationStatus} />
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-small btn-icon"
                  disabled={blocked || picked.length >= max}
                  title={blocked ? 'Only problems whose reference solution passed verification can be attached' : undefined}
                  onClick={() => onChange([...picked, { questionId: q.id, title: q.title, difficulty: q.difficulty }])}
                >
                  <Plus size={13} /> Add
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
