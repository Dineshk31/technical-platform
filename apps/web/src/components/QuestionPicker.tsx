import { Fragment, useEffect, useState } from 'react';
import { CODING_TOPICS, DIFFICULTY_LEVELS } from '@technical-platform/shared';
import { ApiError } from '../lib/api-client';
import { getQuestion, listQuestions, type QuestionDetail, type QuestionListItem } from '../lib/questions-api';
import { DifficultyBadge } from './ApprovalBadge';

/**
 * Replaces the Phase 2 "paste a question ID" text field. Only ever searches
 * approvalStatus=APPROVED questions — the backend independently re-enforces
 * that rule on attach, this just keeps an admin from picking something that
 * would be rejected anyway.
 */
export function QuestionPicker({
  alreadyAttachedIds,
  onSelect,
}: {
  alreadyAttachedIds: string[];
  onSelect: (question: QuestionListItem) => void;
}) {
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [topic, setTopic] = useState('');
  const [results, setResults] = useState<QuestionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<QuestionDetail | null>(null);

  async function runSearch() {
    setLoading(true);
    setError(null);
    try {
      const res = await listQuestions({
        approvalStatus: 'APPROVED',
        search: search || undefined,
        difficulty: difficulty || undefined,
        topic: topic || undefined,
        pageSize: 20,
      });
      setResults(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to search questions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, topic]);

  async function togglePreview(id: string) {
    if (previewId === id) {
      setPreviewId(null);
      setPreviewData(null);
      return;
    }
    setPreviewId(id);
    setPreviewData(await getQuestion(id));
  }

  return (
    <div className="section-block">
      <div className="filters-row">
        <input
          placeholder="Search approved questions by title"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
          style={{ marginBottom: 0, minWidth: 220 }}
        />
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          <option value="">All difficulties</option>
          {DIFFICULTY_LEVELS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">All topics</option>
          {CODING_TOPICS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button type="button" className="btn-secondary btn-small" onClick={() => void runSearch()}>
          Search
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : results.length === 0 ? (
        <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>
          No approved questions match. Approve questions in the Question Bank first.
        </p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Difficulty</th>
              <th>Topics</th>
              <th>Marks</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {results.map((q) => {
              const attached = alreadyAttachedIds.includes(q.id);
              return (
                <Fragment key={q.id}>
                  <tr>
                    <td>{q.title}</td>
                    <td>
                      <DifficultyBadge difficulty={q.difficulty} />
                    </td>
                    <td>
                      {q.topics.map((t) => (
                        <span key={t} className="topic-tag">
                          {t}
                        </span>
                      ))}
                    </td>
                    <td>{q.marks}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn-secondary btn-small" onClick={() => void togglePreview(q.id)}>
                        {previewId === q.id ? 'Hide' : 'Preview'}
                      </button>{' '}
                      <button type="button" className="btn-small" disabled={attached} title={attached ? 'Already attached' : ''} onClick={() => onSelect(q)}>
                        {attached ? 'Attached' : 'Select'}
                      </button>
                    </td>
                  </tr>
                  {previewId === q.id && previewData && (
                    <tr>
                      <td colSpan={5} style={{ background: 'var(--color-bg)' }}>
                        <p style={{ margin: '0.5rem 0' }}>{previewData.problemStatement}</p>
                        {previewData.examples[0] && (
                          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                            Example — input: <code>{previewData.examples[0].input}</code>, output:{' '}
                            <code>{previewData.examples[0].output}</code>
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
