import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Code2 } from 'lucide-react';
import { CODING_TOPICS, DIFFICULTY_LEVELS, PROGRAMMING_LANGUAGES } from '@technical-platform/shared';
import { ApiError } from '../lib/api-client';
import { listPracticeQuestions, type PracticeQuestionListItem, type PracticeSortOption } from '../lib/practice-api';
import { DifficultyBadge } from '../components/ApprovalBadge';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { SkeletonTable } from '../components/Skeleton';
import { QUESTION_STATUS_LABELS, questionStatusPillClass } from '../lib/verdict';

const STATUS_OPTIONS = ['SOLVED', 'ATTEMPTED', 'UNSOLVED'] as const;
const SORT_OPTIONS: { value: PracticeSortOption; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'recommended', label: 'Recommended' },
  { value: 'easiest', label: 'Easiest first' },
  { value: 'hardest', label: 'Hardest first' },
];

export function PracticeExplorerPage() {
  // Same URL-as-source-of-truth pattern as AdminQuestionBankPage — filters survive
  // back/forward navigation and are shareable/bookmarkable.
  const [searchParams, setSearchParams] = useSearchParams();
  const difficulty = searchParams.get('difficulty') ?? '';
  const topic = searchParams.get('topic') ?? '';
  const language = searchParams.get('language') ?? '';
  const status = searchParams.get('status') ?? '';
  const sort = (searchParams.get('sort') as PracticeSortOption) || 'newest';
  const urlSearch = searchParams.get('search') ?? '';
  const page = Number(searchParams.get('page') ?? '1');

  const [searchInput, setSearchInput] = useState(urlSearch);
  useEffect(() => setSearchInput(urlSearch), [urlSearch]);

  const [questions, setQuestions] = useState<PracticeQuestionListItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  async function refresh() {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listPracticeQuestions({
        search: urlSearch || undefined,
        difficulty: difficulty || undefined,
        topic: topic || undefined,
        language: language || undefined,
        status: (status as PracticeQuestionListItem['status'] | 'UNSOLVED') || undefined,
        sort,
        page,
        pageSize: 20,
      });
      if (requestId !== requestIdRef.current) return;
      setQuestions(result.data);
      setTotalPages(result.meta.totalPages);
      setTotal(result.meta.total);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof ApiError ? err.message : 'Failed to load problems');
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
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  }

  function handleSearch() {
    setFilter('search', searchInput);
  }

  function goToPage(next: number) {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('page', String(next));
        return p;
      },
      { replace: true },
    );
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, topic, language, status, sort, urlSearch, page]);

  return (
    <div className="dashboard-body">
      <Link to="/student/practice" className="back-link">
        <ArrowLeft size={14} /> Back to practice
      </Link>

      <div className="page-header">
        <h1 style={{ margin: 0 }}>Problems{!loading && ` (${total})`}</h1>
      </div>

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
          <select value={language} onChange={(e) => setFilter('language', e.target.value)}>
            <option value="">All languages</option>
            {PROGRAMMING_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">Any status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === 'UNSOLVED' ? 'Not attempted' : QUESTION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button className="btn-secondary btn-small" onClick={handleSearch}>
            Search
          </button>
          <select
            value={sort}
            onChange={(e) => setFilter('sort', e.target.value === 'newest' ? '' : e.target.value)}
            style={{ marginLeft: 'auto' }}
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                Sort: {s.label}
              </option>
            ))}
          </select>
        </div>

        {error && <ErrorState message={error} />}
        {loading ? (
          <SkeletonTable rows={6} columns={5} />
        ) : questions.length === 0 ? (
          <EmptyState
            icon={<Code2 size={22} />}
            title="No problems found"
            description="Try adjusting your search or filters."
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Difficulty</th>
                    <th>Topics</th>
                    <th>Languages</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((q) => (
                    <tr key={q.id}>
                      <td>
                        <Link to={`/student/practice/problems/${q.id}`}>{q.title}</Link>
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
                      <td>{q.supportedLanguages.join(', ')}</td>
                      <td>
                        <span className={`exam-status-pill ${questionStatusPillClass(q.status)}`}>
                          {QUESTION_STATUS_LABELS[q.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: '1rem', marginBottom: 0 }}>
                <button className="btn-secondary btn-small" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                  Previous
                </button>
                <Badge variant="neutral">
                  Page {page} of {totalPages}
                </Badge>
                <button className="btn-secondary btn-small" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
