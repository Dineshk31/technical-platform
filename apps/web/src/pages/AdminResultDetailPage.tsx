import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../lib/api-client';
import { getAdminResultDetail, type AdminResultDetailDto } from '../lib/results-api';
import { StatusBadge } from '../components/StatusBadge';
import { ResultBreakdown } from '../components/ResultBreakdown';

export function AdminResultDetailPage() {
  const { id, attemptId } = useParams<{ id: string; attemptId: string }>();
  const [detail, setDetail] = useState<AdminResultDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !attemptId) return;
    getAdminResultDetail(id, attemptId)
      .then(setDetail)
      .catch((err) => setError(err instanceof ApiError ? `${err.status}: ${err.message}` : 'Failed to load result'))
      .finally(() => setLoading(false));
  }, [id, attemptId]);

  if (loading) return <div className="dashboard-body">Loading…</div>;
  if (error || !detail) return <div className="dashboard-body form-error">{error ?? 'Not found'}</div>;

  return (
    <div className="dashboard-body">
      <Link to={`/admin/assessments/${id}/results`} className="back-link">
        ← Back to results
      </Link>

      <div className="page-header">
        <h1 style={{ margin: 0 }}>
          {detail.student.name} <StatusBadge status={detail.attemptStatus} />
        </h1>
      </div>
      <p style={{ color: 'var(--color-muted)', marginTop: 0 }}>{detail.student.email}</p>

      {!detail.finalized ? (
        <div className="card">
          <h2>Attempt in progress</h2>
          <p>
            This student started the assessment at {new Date(detail.startedAt).toLocaleString()} and has not finished yet
            (window ends {new Date(detail.endedAt).toLocaleString()}). No score is available until the attempt is
            submitted or the assessment window ends.
          </p>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="result-summary-grid">
              <div className="result-stat">
                <div className="result-stat-value">
                  {detail.totalScore} / {detail.maxScore}
                </div>
                <div className="result-stat-label">Score</div>
              </div>
              <div className="result-stat">
                <div className="result-stat-value">{detail.percentage}%</div>
                <div className="result-stat-label">Percentage</div>
              </div>
              <div className="result-stat">
                <div className="result-stat-value">
                  {detail.questionsSolved} / {detail.totalQuestions}
                </div>
                <div className="result-stat-label">Solved</div>
              </div>
            </div>
            <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem', marginTop: '0.9rem', marginBottom: 0 }}>
              Started {new Date(detail.startedAt).toLocaleString()}
              {detail.submittedAt && <> · Submitted {new Date(detail.submittedAt).toLocaleString()}</>}
            </p>
          </div>

          <ResultBreakdown sections={detail.sections} />
        </>
      )}
    </div>
  );
}
