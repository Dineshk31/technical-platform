import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, PlayCircle } from 'lucide-react';
import { ApiError } from '../lib/api-client';
import { getStudentAssessment, startAssessment, type StudentAssessmentDetail } from '../lib/assessments-api';
import { getAttemptStatus } from '../lib/attempts-api';
import { StatusBadge } from '../components/StatusBadge';
import { ErrorState } from '../components/ErrorState';
import { LoadingRow } from '../components/Skeleton';

export function StudentAssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState<StudentAssessmentDetail | null>(null);
  const [existingAttemptId, setExistingAttemptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setAssessment(await getStudentAssessment(id));
        try {
          const status = await getAttemptStatus(id);
          setExistingAttemptId(status.attemptId);
        } catch (err) {
          // 404 just means "not started yet" — not an error for this page.
          if (!(err instanceof ApiError && err.status === 404)) throw err;
        }
      } catch (err) {
        setError(err instanceof ApiError ? `${err.status}: ${err.message}` : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function handleStart() {
    if (!id) return;
    setStarting(true);
    setError(null);
    try {
      const attempt = await startAssessment(id);
      navigate(`/student/attempts/${attempt.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start assessment');
    } finally {
      setStarting(false);
    }
  }

  if (loading) return <div className="dashboard-body"><LoadingRow label="Loading assessment…" /></div>;
  if (!assessment) return <div className="dashboard-body"><ErrorState message={error ?? 'Assessment not found'} /></div>;

  return (
    <div className="dashboard-body">
      <Link to="/student" className="back-link">
        <ArrowLeft size={14} /> Back to your assessments
      </Link>

      <div className="page-header">
        <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {assessment.title} <StatusBadge status={assessment.status} />
        </h1>
      </div>

      <div className="card">
        {assessment.description && <p>{assessment.description}</p>}
        {assessment.instructions && (
          <>
            <h3>Instructions</h3>
            <p>{assessment.instructions}</p>
          </>
        )}
        <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>
          Duration: {assessment.durationMinutes} minutes · Window: {new Date(assessment.startAt).toLocaleString()} →{' '}
          {new Date(assessment.endAt).toLocaleString()} · Total marks: {assessment.maxMarks}
        </p>

        {error && <ErrorState message={error} />}

        {existingAttemptId ? (
          <div className="action-row">
            <Link to={`/student/attempts/${existingAttemptId}`}>
              <button>{assessment.status === 'ACTIVE' ? 'Resume assessment' : 'Review assessment'}</button>
            </Link>
            {(assessment.status === 'COMPLETED' || assessment.status === 'ARCHIVED') && (
              <Link to={`/student/attempts/${existingAttemptId}/result`}>
                <button className="btn-secondary">View result</button>
              </Link>
            )}
          </div>
        ) : assessment.status === 'ACTIVE' ? (
          <button className="btn-icon" onClick={() => void handleStart()} disabled={starting}>
            <PlayCircle size={15} /> {starting ? 'Starting…' : 'Start assessment'}
          </button>
        ) : assessment.status === 'PUBLISHED' ? (
          <p>This assessment has not started yet.</p>
        ) : (
          <p>This assessment's window has ended.</p>
        )}
      </div>
    </div>
  );
}
