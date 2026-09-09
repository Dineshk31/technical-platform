import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, PlayCircle, Plus, Users } from 'lucide-react';
import { ApiError } from '../lib/api-client';
import { createAssessment, listAssessments, type AssessmentListItem } from '../lib/assessments-api';
import { StatusBadge } from '../components/StatusBadge';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/Card';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { SkeletonTable, LoadingRow } from '../components/Skeleton';

interface Overview {
  total: number;
  active: number;
  draft: number;
  participants: number;
}

export function AdminDashboardPage() {
  const [assessments, setAssessments] = useState<AssessmentListItem[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
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
      if (!statusFilter && !search) {
        setOverview({
          total: result.meta.total,
          active: result.data.filter((a) => a.effectiveStatus === 'ACTIVE').length,
          draft: result.data.filter((a) => a.status === 'DRAFT').length,
          participants: result.data.reduce((sum, a) => sum + a.participantsCount, 0),
        });
      }
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
    <div className="dashboard-body">
      <PageHeader
        title="Assessments"
        subtitle="Create, publish, and monitor technical assessments."
        actions={
          <>
            <Link to="/admin/questions/ai-generate">
              <Button variant="secondary" icon={<PlayCircle size={16} />}>
                Generate with AI
              </Button>
            </Link>
            <Button icon={<Plus size={16} />} onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? 'Cancel' : 'Create assessment'}
            </Button>
          </>
        }
      />

      {overview && (
        <div className="stat-card-grid">
          <StatCard label="Total assessments" value={overview.total} icon={<ClipboardList size={18} />} />
          <StatCard label="Active now" value={overview.active} hint="Within their start/end window" icon={<PlayCircle size={18} />} />
          <StatCard label="Drafts" value={overview.draft} hint="Not yet published" icon={<ClipboardList size={18} />} />
          <StatCard label="Participants assigned" value={overview.participants} icon={<Users size={18} />} />
        </div>
      )}

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
          <Button variant="secondary" size="sm" onClick={() => void refresh()}>
            Search
          </Button>
        </div>

        {error && <ErrorState message={error} />}
        {loading ? (
          <SkeletonTable rows={4} columns={6} />
        ) : assessments.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={22} />}
            title="No assessments yet"
            description="Create your first assessment, or generate coding questions with AI to build one from."
            action={
              <Button size="sm" onClick={() => setShowCreate(true)}>
                Create assessment
              </Button>
            }
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
          </div>
        )}
      </div>
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
          <Button type="submit" disabled={submitting}>
            {submitting ? <LoadingRow label="Creating…" /> : 'Create draft'}
          </Button>
        </div>
      </form>
    </div>
  );
}
