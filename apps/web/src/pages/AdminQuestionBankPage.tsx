import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Database, Plus, Sparkles } from 'lucide-react';
import {
  CODING_TOPICS,
  DIFFICULTY_LEVELS,
  APPROVAL_STATUS_CODES,
  MCQ_TOPICS,
  QUESTION_SOURCE_CODES,
  QUESTION_TYPE_CODES,
} from '@technical-platform/shared';
import { ApiError } from '../lib/api-client';
import { listQuestions, type QuestionListItem } from '../lib/questions-api';
import { ApprovalBadge, DifficultyBadge, QuestionTypeBadge, SourceBadge } from '../components/ApprovalBadge';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { SkeletonTable } from '../components/Skeleton';

export function AdminQuestionBankPage() {
  // The URL is the single source of truth for filters (not mirrored into local state)
  // so that navigating here via a Link — e.g. the "AI Review Queue" shortcut — always
  // applies, even when this page is already mounted and only the search params change
  // (React Router doesn't remount on a same-route navigation).
  const [searchParams, setSearchParams] = useSearchParams();
  const type = searchParams.get('type') ?? '';
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
        type: type || undefined,
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
  }, [type, difficulty, topic, approvalStatus, source, urlSearch]);

  const isAiReviewQueue = source === 'AI_GENERATED' && approvalStatus === 'PENDING_REVIEW';
  const topicOptions = type === 'MCQ' ? MCQ_TOPICS : type === 'CODING' ? CODING_TOPICS : [...CODING_TOPICS, ...MCQ_TOPICS];

  function editLink(q: QuestionListItem): string {
    return q.type === 'MCQ' ? `/admin/questions/mcq/${q.id}/edit` : `/admin/questions/${q.id}/edit`;
  }

  return (
    <div className="dashboard-body">
      <Link to="/admin" className="back-link">
        <ArrowLeft size={14} /> Back to assessments
      </Link>

      <div className="page-header">
        <h1 style={{ margin: 0 }}>{isAiReviewQueue ? 'AI Review Queue' : 'Question Bank'}</h1>
        <div className="action-row" style={{ marginBottom: 0 }}>
          <Link to="/admin/questions?source=AI_GENERATED&approvalStatus=PENDING_REVIEW">
            <button className="btn-secondary btn-icon">
              <Database size={15} /> AI Review Queue
            </button>
          </Link>
          <Link to="/admin/questions/ai-generate">
            <button className="btn-secondary btn-icon">
              <Sparkles size={15} /> Generate with AI
            </button>
          </Link>
          <Link to="/admin/questions/mcq/new">
            <button className="btn-secondary btn-icon">
              <Plus size={15} /> Create MCQ
            </button>
          </Link>
          <Link to="/admin/questions/new">
            <button className="btn-icon">
              <Plus size={15} /> Create question
            </button>
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
          <select value={type} onChange={(e) => setFilter('type', e.target.value)}>
            <option value="">All questions</option>
            {QUESTION_TYPE_CODES.map((t) => (
              <option key={t} value={t}>
                {t === 'CODING' ? 'Coding' : 'MCQ'}
              </option>
            ))}
          </select>
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
            {topicOptions.map((t) => (
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

        {error && <ErrorState message={error} />}
        {loading ? (
          <SkeletonTable rows={5} columns={7} />
        ) : questions.length === 0 ? (
          <EmptyState
            icon={<Database size={22} />}
            title={isAiReviewQueue ? 'Nothing to review' : 'No questions found'}
            description={
              isAiReviewQueue
                ? 'No AI-generated questions are awaiting review right now.'
                : 'Create a question manually, or generate a batch with AI.'
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Source</th>
                  <th>Difficulty</th>
                  <th>Topics</th>
                  <th>Marks</th>
                  <th>Detail</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <Link to={editLink(q)}>{q.title}</Link>
                    </td>
                    <td>
                      <QuestionTypeBadge type={q.type} />
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
                      {q.type === 'MCQ'
                        ? `${q.optionCount ?? 0} option(s)`
                        : `${q.publicTestCaseCount} public / ${q.hiddenTestCaseCount} hidden`}
                    </td>
                    <td>
                      <ApprovalBadge status={q.approvalStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
