import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CODING_TOPICS, DIFFICULTY_LEVELS, APPROVAL_STATUS_CODES, QUESTION_SOURCE_CODES } from '@technical-platform/shared';
import { ApiError } from '../lib/api-client';
import { listQuestions, type QuestionListItem } from '../lib/questions-api';
import { ApprovalBadge, DifficultyBadge } from '../components/ApprovalBadge';

export function AdminQuestionBankPage() {
  const [questions, setQuestions] = useState<QuestionListItem[]>([]);
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [topic, setTopic] = useState('');
  const [approvalStatus, setApprovalStatus] = useState('');
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const result = await listQuestions({
        search: search || undefined,
        difficulty: difficulty || undefined,
        topic: topic || undefined,
        approvalStatus: approvalStatus || undefined,
        source: source || undefined,
        pageSize: 50,
      });
      setQuestions(result.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, topic, approvalStatus, source]);

  return (
    <div className="dashboard-body">
      <Link to="/admin" className="back-link">
        ← Back to assessments
      </Link>

      <div className="page-header">
        <h1 style={{ margin: 0 }}>Question Bank</h1>
        <div className="action-row" style={{ marginBottom: 0 }}>
          <Link to="/admin/questions/ai-generate">
            <button className="btn-secondary">Generate with AI</button>
          </Link>
          <Link to="/admin/questions/new">
            <button>Create question</button>
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="filters-row">
          <input
            placeholder="Search by title"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void refresh()}
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
          <select value={approvalStatus} onChange={(e) => setApprovalStatus(e.target.value)}>
            <option value="">All statuses</option>
            {APPROVAL_STATUS_CODES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All sources</option>
            {QUESTION_SOURCE_CODES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
          <button className="btn-secondary btn-small" onClick={() => void refresh()}>
            Search
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}
        {loading ? (
          <p>Loading…</p>
        ) : questions.length === 0 ? (
          <p>No questions found.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
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
