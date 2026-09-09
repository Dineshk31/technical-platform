import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Trophy } from 'lucide-react';
import { ATTEMPT_STATUS_CODES } from '@technical-platform/shared';
import { ApiError } from '../lib/api-client';
import { getAdminAssessment, type AdminAssessmentDetail } from '../lib/assessments-api';
import { listAssessmentResults, type AdminResultListItemDto } from '../lib/results-api';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { SkeletonTable } from '../components/Skeleton';

const STATUS_FILTERS = ['NOT_STARTED', ...ATTEMPT_STATUS_CODES] as const;
const PAGE_SIZE = 20;

export function AdminResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [assessment, setAssessment] = useState<AdminAssessmentDetail | null>(null);
  const [rows, setRows] = useState<AdminResultListItemDto[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getAdminAssessment(id)
      .then(setAssessment)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load assessment'));
  }, [id]);

  async function refresh() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listAssessmentResults(id, {
        page,
        pageSize: PAGE_SIZE,
        status: status || undefined,
        search: search || undefined,
      });
      setRows(result.data);
      setMeta(result.meta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load results');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, status, page]);

  return (
    <div className="dashboard-body">
      <Link to={`/admin/assessments/${id}`} className="back-link">
        <ArrowLeft size={14} /> Back to assessment
      </Link>

      <div className="page-header">
        <h1 style={{ margin: 0 }}>Results {assessment ? `— ${assessment.title}` : ''}</h1>
      </div>

      <div className="card">
        <div className="filters-row">
          <input
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(1);
                void refresh();
              }
            }}
            style={{ marginBottom: 0, minWidth: 240 }}
          />
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
          <button
            className="btn-secondary btn-small"
            onClick={() => {
              setPage(1);
              void refresh();
            }}
          >
            Search
          </button>
        </div>

        {error && <ErrorState message={error} />}
        {loading ? (
          <SkeletonTable rows={5} columns={6} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Trophy size={22} />} title="No participants match this filter" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Score</th>
                    <th>Percentage</th>
                    <th>Submitted</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.userId}>
                      <td>{r.studentName}</td>
                      <td>{r.studentEmail}</td>
                      <td>
                        <span className={`badge ${r.attemptStatus === 'NOT_STARTED' ? 'badge-archived' : r.attemptStatus === 'IN_PROGRESS' ? 'badge-draft' : 'badge-active'}`}>
                          {r.attemptStatus.replace('_', ' ')}
                        </span>
                      </td>
                      <td>{r.totalScore !== null ? `${r.totalScore} / ${r.maxScore}` : '—'}</td>
                      <td>{r.percentage !== null ? `${r.percentage}%` : '—'}</td>
                      <td>{r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '—'}</td>
                      <td>{r.attemptId && <Link to={`/admin/assessments/${id}/results/${r.attemptId}`}>View</Link>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {meta.totalPages > 1 && (
              <div className="action-row" style={{ marginTop: '0.8rem', alignItems: 'center' }}>
                <button className="btn-secondary btn-small btn-icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft size={14} /> Previous
                </button>
                <span style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                  Page {meta.page} of {meta.totalPages} ({meta.total} total)
                </span>
                <button className="btn-secondary btn-small btn-icon" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
