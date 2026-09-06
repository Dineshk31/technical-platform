import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api-client';
import { listAssignedAssessments, type StudentAssignedListItem } from '../lib/assessments-api';
import { StatusBadge } from '../components/StatusBadge';

export function StudentDashboardPage() {
  const { user, logout } = useAuth();
  const [assessments, setAssessments] = useState<StudentAssignedListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAssignedAssessments()
      .then((res) => setAssessments(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load assessments'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Technical Assessment</h1>
          <p>
            Signed in as {user?.name} ({user?.email})
          </p>
        </div>
        <button onClick={() => void logout()}>Sign out</button>
      </header>

      <main className="dashboard-body">
        <h2>Your assessments</h2>
        {error && <p className="form-error">{error}</p>}
        {loading ? (
          <p>Loading…</p>
        ) : assessments.length === 0 ? (
          <p>You have no assessments assigned yet.</p>
        ) : (
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
                  <td>{a.title}</td>
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
        )}
      </main>
    </div>
  );
}
