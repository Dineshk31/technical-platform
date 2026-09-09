import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ClipboardList } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api-client';
import { listAssignedAssessments, type StudentAssignedListItem } from '../lib/assessments-api';
import { StatusBadge } from '../components/StatusBadge';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { SkeletonTable } from '../components/Skeleton';

export function StudentDashboardPage() {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState<StudentAssignedListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAssignedAssessments()
      .then((res) => setAssessments(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load assessments'))
      .finally(() => setLoading(false));
  }, []);

  const firstName = user?.name?.split(' ')[0];

  return (
    <div className="dashboard-body">
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : 'Your assessments'}
        subtitle="Everything assigned to you, in one place."
      />

      <div className="card">
        {error && <ErrorState message={error} />}
        {loading ? (
          <SkeletonTable rows={3} columns={5} />
        ) : assessments.length === 0 ? (
          <EmptyState
            icon={<CalendarClock size={22} />}
            title="No assessments assigned yet"
            description="When your instructor assigns you a technical assessment, it will show up here."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Window</th>
                  <th>Marks</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {assessments.map((a) => (
                  <tr key={a.id}>
                    <td style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ClipboardList size={15} style={{ color: 'var(--color-muted)' }} />
                      {a.title}
                    </td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                    <td>
                      {new Date(a.startAt).toLocaleString()} → {new Date(a.endAt).toLocaleString()}
                    </td>
                    <td>{a.maxMarks}</td>
                    <td>
                      {a.hasStarted && a.attemptId ? (
                        <Link to={`/student/attempts/${a.attemptId}`}>Resume</Link>
                      ) : (
                        <Link to={`/student/assessments/${a.id}`}>View</Link>
                      )}
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
