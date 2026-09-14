import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ClipboardList,
  Database,
  ListChecks,
  Plus,
  PlayCircle,
  Sparkles,
  Users,
} from 'lucide-react';
import { ApiError } from '../lib/api-client';
import { createAssessment, listAssessments, type AssessmentListItem } from '../lib/assessments-api';
import { listQuestions } from '../lib/questions-api';
import { StatusBadge } from '../components/StatusBadge';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/Card';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { SkeletonTable, LoadingRow } from '../components/Skeleton';

interface Overview {
  totalAssessments: number;
  draftCount: number;
  activeCount: number;
  upcomingCount: number;
  participants: number;
  totalQuestions: number;
  approvedQuestions: number;
  pendingAiReview: number;
}

// A page-wide fetch to build the overview needs every assessment, not just one
// page of the (separately filterable) list below — 100 is generous headroom
// over this platform's real current scale (18 assessments today) without
// adding a dedicated summary endpoint for numbers the list endpoint already
// computes correctly per-page via `meta.total`.
const OVERVIEW_PAGE_SIZE = 100;

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') ?? '';
  const [search, setSearch] = useState('');
  const [assessments, setAssessments] = useState<AssessmentListItem[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function refreshList() {
    setLoading(true);
    setListError(null);
    try {
      const result = await listAssessments({ status: statusFilter || undefined, search: search || undefined });
      setAssessments(result.data);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Failed to load assessments');
    } finally {
      setLoading(false);
    }
  }

  async function refreshOverview() {
    setOverviewError(null);
    try {
      const [allAssessments, allQuestions, approvedQuestions, pendingAi] = await Promise.all([
        listAssessments({ pageSize: OVERVIEW_PAGE_SIZE }),
        listQuestions({ pageSize: 1 }),
        listQuestions({ pageSize: 1, approvalStatus: 'APPROVED' }),
        listQuestions({ pageSize: 1, source: 'AI_GENERATED', approvalStatus: 'PENDING_REVIEW' }),
      ]);
      setOverview({
        totalAssessments: allAssessments.meta.total,
        draftCount: allAssessments.data.filter((a) => a.status === 'DRAFT').length,
        activeCount: allAssessments.data.filter((a) => a.effectiveStatus === 'ACTIVE').length,
        upcomingCount: allAssessments.data.filter((a) => a.effectiveStatus === 'PUBLISHED').length,
        participants: allAssessments.data.reduce((sum, a) => sum + a.participantsCount, 0),
        totalQuestions: allQuestions.meta.total,
        approvedQuestions: approvedQuestions.meta.total,
        pendingAiReview: pendingAi.meta.total,
      });
    } catch (err) {
      setOverviewError(err instanceof ApiError ? err.message : 'Failed to load overview');
    }
  }

  useEffect(() => {
    void refreshOverview();
  }, []);

  useEffect(() => {
    void refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  function setStatusFilter(value: string) {
    setSearchParams(value ? { status: value } : {}, { replace: true });
  }

  return (
    <div className="dashboard-body">
      <PageHeader
        title="Command Center"
        subtitle="What needs your attention, right now — plus everything you can manage."
        actions={
          <>
            <Link to="/admin/questions/ai-generate">
              <Button variant="secondary" icon={<Sparkles size={16} />}>
                Generate with AI
              </Button>
            </Link>
            <Button icon={<Plus size={16} />} onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? 'Cancel' : 'Create assessment'}
            </Button>
          </>
        }
      />

      {overviewError && <ErrorState message={overviewError} />}

      {overview && (overview.pendingAiReview > 0 || overview.draftCount > 0) && (
        <>
          <div className="section-title-row" style={{ marginTop: 0 }}>
            <h2>Needs attention</h2>
          </div>
          <div className="stat-card-grid">
            {overview.pendingAiReview > 0 && (
              <StatCard
                label="AI questions pending review"
                value={overview.pendingAiReview}
                hint="Review now"
                icon={<ListChecks size={18} />}
                to="/admin/questions?source=AI_GENERATED&approvalStatus=PENDING_REVIEW"
                tone="attention"
              />
            )}
            {overview.draftCount > 0 && (
              <StatCard
                label="Draft assessments"
                value={overview.draftCount}
                hint="Continue building"
                icon={<ClipboardList size={18} />}
                to="/admin?status=DRAFT"
                tone="attention"
              />
            )}
          </div>
        </>
      )}

      <div className="section-title-row" style={{ marginTop: overview && (overview.pendingAiReview > 0 || overview.draftCount > 0) ? undefined : 0 }}>
        <h2>Assessments</h2>
      </div>
      <div className="stat-card-grid">
        <StatCard label="Total" value={overview?.totalAssessments ?? '—'} icon={<ClipboardList size={18} />} to="/admin" />
        <StatCard
          label="Active now"
          value={overview?.activeCount ?? '—'}
          hint="Within their start/end window"
          icon={<PlayCircle size={18} />}
          to="/admin?status=ACTIVE"
        />
        <StatCard
          label="Upcoming"
          value={overview?.upcomingCount ?? '—'}
          hint="Published, not yet open"
          icon={<ClipboardList size={18} />}
          to="/admin?status=PUBLISHED"
        />
        {/* No single destination shows "participants assigned" as one list (it's a sum across every
            assessment's own roster) — left as a plain, non-linked stat rather than invented a page for it. */}
        <StatCard label="Participants assigned" value={overview?.participants ?? '—'} icon={<Users size={18} />} />
      </div>

      <div className="section-title-row">
        <h2>Question bank</h2>
        <Link to="/admin/questions" className="section-title-link">
          Manage questions →
        </Link>
      </div>
      <div className="stat-card-grid">
        <StatCard label="Total questions" value={overview?.totalQuestions ?? '—'} icon={<Database size={18} />} to="/admin/questions" />
        <StatCard
          label="Approved"
          value={overview?.approvedQuestions ?? '—'}
          hint="Usable in an assessment"
          icon={<Database size={18} />}
          to="/admin/questions?approvalStatus=APPROVED"
        />
        <StatCard
          label="Pending AI review"
          value={overview?.pendingAiReview ?? '—'}
          hint={overview && overview.pendingAiReview > 0 ? 'Review now' : undefined}
          icon={<Sparkles size={18} />}
          to="/admin/questions?source=AI_GENERATED&approvalStatus=PENDING_REVIEW"
          tone={overview && overview.pendingAiReview > 0 ? 'attention' : 'neutral'}
        />
      </div>

      {showCreate && (
        <CreateAssessmentForm
          onCreated={(id) => {
            setShowCreate(false);
            navigate(`/admin/assessments/${id}`);
          }}
        />
      )}

      <div className="section-title-row">
        <h2>All assessments</h2>
      </div>
      <div className="card">
        <div className="action-row">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <input placeholder="Search by title" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 0 }} />
          <Button variant="secondary" size="sm" onClick={() => void refreshList()}>
            Search
          </Button>
        </div>

        {listError && <ErrorState message={listError} />}
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

function CreateAssessmentForm({ onCreated }: { onCreated: (id: string) => void }) {
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
      const created = await createAssessment({
        title,
        description: description || undefined,
        durationMinutes,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
      });
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create assessment');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <h2>New assessment</h2>
      <p className="field-hint" style={{ marginTop: 0 }}>
        This creates a draft. You'll build out sections, questions, and participants next.
      </p>
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
            {submitting ? <LoadingRow label="Creating…" /> : 'Create draft and continue'}
          </Button>
        </div>
      </form>
    </div>
  );
}
