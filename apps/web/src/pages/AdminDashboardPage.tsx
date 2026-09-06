import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api-client';
import { createAssessment, listAssessments, type AssessmentListItem } from '../lib/assessments-api';
import { StatusBadge } from '../components/StatusBadge';

export function AdminDashboardPage() {
  const { user, logout } = useAuth();
  const [assessments, setAssessments] = useState<AssessmentListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const result = await listAssessments({ status: statusFilter || undefined, search: search || undefined });
      setAssessments(result.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load assessments');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Technical Assessment — Admin</h1>
          <p>
            Signed in as {user?.name} ({user?.email})
          </p>
        </div>
        <div className="action-row" style={{ marginBottom: 0 }}>
          <Link to="/admin/questions">
            <button className="btn-secondary">Question Bank</button>
          </Link>
          <button onClick={() => void logout()}>Sign out</button>
        </div>
      </header>

      <main className="dashboard-body">
        <div className="page-header">
          <h2 style={{ margin: 0 }}>Assessments</h2>
          <button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'Cancel' : 'Create assessment'}</button>
        </div>

        {showCreate && (
          <CreateAssessmentForm
            onCreated={() => {
              setShowCreate(false);
              void refresh();
            }}
          />
        )}

        <div className="card">
          <div className="action-row">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="COMPLETED">Completed</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <input placeholder="Search by title" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 0 }} />
            <button className="btn-secondary btn-small" onClick={() => void refresh()}>
              Search
            </button>
          </div>

          {error && <p className="form-error">{error}</p>}
          {loading ? (
            <p>Loading…</p>
          ) : assessments.length === 0 ? (
            <p>No assessments yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Window</th>
                  <th>Marks</th>
                  <th>Sections</th>
                  <th>Participants</th>
                </tr>
              </thead>
              <tbody>
                {assessments.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link to={`/admin/assessments/${a.id}`}>{a.title}</Link>
                    </td>
                    <td>
                      <StatusBadge status={a.effectiveStatus} />
                    </td>
                    <td>
                      {new Date(a.startAt).toLocaleString()} → {new Date(a.endAt).toLocaleString()}
                    </td>
                    <td>{a.maxMarks}</td>
                    <td>{a.sectionsCount}</td>
                    <td>{a.participantsCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

function CreateAssessmentForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createAssessment({
        title,
        description: description || undefined,
        durationMinutes,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create assessment');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <h2>New assessment</h2>
      <form onSubmit={handleSubmit} className="form-grid">
        <div className="field-full">
          <label htmlFor="title">Title</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required style={{ width: '100%' }} />
        </div>
        <div className="field-full">
          <label htmlFor="description">Description</label>
          <input id="description" value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div>
          <label htmlFor="duration">Duration (minutes)</label>
          <input
            id="duration"
            type="number"
            min={1}
            max={600}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            required
          />
        </div>
        <div />
        <div>
          <label htmlFor="startAt">Start</label>
          <input id="startAt" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="endAt">End</label>
          <input id="endAt" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} required />
        </div>
        {error && <p className="form-error field-full">{error}</p>}
        <div className="field-full">
          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create draft'}
          </button>
        </div>
      </form>
    </div>
  );
}
