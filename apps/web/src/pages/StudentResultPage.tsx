import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ApiError } from '../lib/api-client';
import { getAttemptDetail } from '../lib/attempts-api';
import { getStudentResult, type OverallResultDto } from '../lib/results-api';
import { StatusBadge } from '../components/StatusBadge';
import { ResultBreakdown } from '../components/ResultBreakdown';
import { ErrorState } from '../components/ErrorState';
import { LoadingRow } from '../components/Skeleton';

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function StudentResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [result, setResult] = useState<OverallResultDto | null>(null);
  const [notReady, setNotReady] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;
    (async () => {
      try {
        const attempt = await getAttemptDetail(attemptId);
        if (cancelled) return;
        const data = await getStudentResult(attempt.assessmentId);
        if (cancelled) return;
        setResult(data);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 409) {
          setNotReady(err.message);
        } else {
          setError(err instanceof ApiError ? `${err.status}: ${err.message}` : 'Failed to load your result');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  if (loading) return <div className="dashboard-body"><LoadingRow label="Loading result…" /></div>;

  if (notReady) {
    return (
      <div className="dashboard-body">
        <Link to="/student" className="back-link">
          <ArrowLeft size={14} /> Back to your assessments
        </Link>
        <div className="card">
          <h2>Result not available yet</h2>
          <p>{notReady}</p>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="dashboard-body">
        <Link to="/student" className="back-link">
          <ArrowLeft size={14} /> Back to your assessments
        </Link>
        <ErrorState message={error ?? 'Result not found'} />
      </div>
    );
  }

  return (
    <div className="dashboard-body">
      <Link to="/student" className="back-link">
        <ArrowLeft size={14} /> Back to your assessments
      </Link>

      <div className="page-header">
        <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {result.assessmentTitle} <StatusBadge status={result.attemptStatus} />
        </h1>
      </div>

      <div className="card">
        <div className="result-summary-grid">
          <div className="result-stat">
            <div className="result-stat-value">
              {result.totalScore} / {result.maxScore}
            </div>
            <div className="result-stat-label">Score</div>
          </div>
          <div className="result-stat">
            <div className="result-stat-value">{result.percentage}%</div>
            <div className="result-stat-label">Percentage</div>
          </div>
          <div className="result-stat">
            <div className="result-stat-value">
              {result.questionsSolved} / {result.totalQuestions}
            </div>
            <div className="result-stat-label">Solved</div>
          </div>
          <div className="result-stat">
            <div className="result-stat-value">{formatDuration(result.timeTakenSeconds)}</div>
            <div className="result-stat-label">Time taken</div>
          </div>
        </div>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem', marginTop: '0.9rem', marginBottom: 0 }}>
          Started {new Date(result.startedAt).toLocaleString()}
          {result.submittedAt && <> · Submitted {new Date(result.submittedAt).toLocaleString()}</>}
        </p>
      </div>

      <ResultBreakdown sections={result.sections} />
    </div>
  );
}
