import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CODING_TOPICS, DIFFICULTY_LEVELS, APPROVAL_STATUS_CODES, QUESTION_SOURCE_CODES } from '@technical-platform/shared';
import { ApiError } from '../lib/api-client';
import { listQuestions, type QuestionListItem } from '../lib/questions-api';
import { ApprovalBadge, DifficultyBadge, SourceBadge } from '../components/ApprovalBadge';

export function AdminQuestionBankPage() {
  // The URL is the single source of truth for filters (not mirrored into local state)
  // so that navigating here via a Link — e.g. the "AI Review Queue" shortcut — always
  // applies, even when this page is already mounted and only the search params change
  // (React Router doesn't remount on a same-route navigation).
  const [searchParams, setSearchParams] = useSearchParams();
  const difficulty = searchParams.get('difficulty') ?? '';
  const topic = searchParams.get('topic') ?? '';
  const approvalStatus = searchParams.get('approvalStatus') ?? '';
  const source = searchParams.get('source') ?? '';
  const urlSearch = searchParams.get('search') ?? '';

  // Free-text search is buffered locally so it doesn't refetch on every keystroke —
  // applied to the URL (and thus refetched) on Enter/Search click, or kept in sync if
  // the URL search param changes from elsewhere (e.g. back/forward navigation).
  const [searchInput, setSearchInput] = useState(urlSearch);
  useEffect(() => setSearchInput(urlSearch), [urlSearch]);

  const [questions, setQuestions] = useState<QuestionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guards against an out-of-order response: if filters change again (e.g. the "AI
  // Review Queue" shortcut is clicked right after this page mounted with a slow,
  // unfiltered initial fetch still in flight), a stale response arriving later must
  // not overwrite the results of the newer request.
  const requestIdRef = useRef(0);

  async function refresh() {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listQuestions({
        search: urlSearch || undefined,
        difficulty: difficulty || undefined,
        topic: topic || undefined,
        approvalStatus: approvalStatus || undefined,
        source: source || undefined,
        pageSize: 50,
      });
      if (requestId !== requestIdRef.current) return;
      setQuestions(result.data);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof ApiError ? err.message : 'Failed to load questions');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  function setFilter(key: string, value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  function handleSearch() {
    setFilter('search', searchInput);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, topic, approvalStatus, source, urlSearch]);

  const isAiReviewQueue = source === 'AI_GENERATED' && approvalStatus === 'PENDING_REVIEW';

  return (
    <div className="dashboard-body">
      <Link to="/admin" className="back-link">
        ← Back to assessments
      </Link>

      <div className="page-header">
        <h1 style={{ margin: 0 }}>{isAiReviewQueue ? 'AI Review Queue' : 'Question Bank'}</h1>
        <div className="action-row" style={{ marginBottom: 0 }}>
          <Link to="/admin/questions?source=AI_GENERATED&approvalStatus=PENDING_REVIEW">
            <button className="btn-secondary">AI Review Queue</button>
          </Link>
          <Link to="/admin/questions/ai-generate">
            <button className="btn-secondary">Generate with AI</button>
          </Link>
          <Link to="/admin/questions/new">
            <button>Create question</button>
          </Link>
        </div>
      </div>
      {isAiReviewQueue && (
        <p className="field-hint" style={{ marginTop: 0 }}>
          AI-generated questions awaiting review — approve to make eligible for assessments, or reject. Open a
          question to see its full content (including hidden test cases and reference solutions) and edit it before
          deciding.
        </p>
      )}

      <div className="card">
        <div className="filters-row">
          <input
            placeholder="Search by title"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            style={{ marginBottom: 0, minWidth: 220 }}
          />
          <select value={difficulty} onChange={(e) => setFilter('difficulty', e.target.value)}>
            <option value="">All difficulties</option>
            {DIFFICULTY_LEVELS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select value={topic} onChange={(e) => setFilter('topic', e.target.value)}>
            <option value="">All topics</option>
            {CODING_TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={approvalStatus} onChange={(e) => setFilter('approvalStatus', e.target.value)}>
            <option value="">All statuses</option>
            {APPROVAL_STATUS_CODES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
          <select value={source} onChange={(e) => setFilter('source', e.target.value)}>
            <option value="">All sources</option>
            {QUESTION_SOURCE_CODES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
          <button className="btn-secondary btn-small" onClick={handleSearch}>
            Search
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}
        {loading ? (
          <p>Loading…</p>
        ) : questions.length === 0 ? (
          <p>{isAiReviewQueue ? 'No AI-generated questions are awaiting review.' : 'No questions found.'}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Source</th>
                <th>Difficulty</th>
                <th>Topics</th>
                <th>Marks</th>
                <th>Test cases</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q.id}>
                  <td>
                    <Link to={`/admin/questions/${q.id}/edit`}>{q.title}</Link>
                  </td>
                  <td>
                    <SourceBadge source={q.source} />
                  </td>
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
                  <td>
                    {q.publicTestCaseCount} public / {q.hiddenTestCaseCount} hidden
                  </td>
                  <td>
                    <ApprovalBadge status={q.approvalStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
