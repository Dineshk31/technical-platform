import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, PlayCircle, Trash2, Users } from 'lucide-react';
import { ApiError } from '../lib/api-client';
import {
  addSection,
  archiveAssessment,
  assignParticipants,
  attachQuestion,
  deleteAssessment,
  detachQuestion,
  getAdminAssessment,
  publishAssessment,
  removeSection,
  unassignParticipant,
  unpublishAssessment,
  updateAssessment,
  updateAssessmentQuestion,
  type AdminAssessmentDetail,
} from '../lib/assessments-api';
import { StatusBadge } from '../components/StatusBadge';
import { QuestionPicker } from '../components/QuestionPicker';
import { QuestionTypeBadge } from '../components/ApprovalBadge';
import { ErrorState } from '../components/ErrorState';
import { LoadingRow } from '../components/Skeleton';
import { useConfirm } from '../components/useConfirm';

export function AdminAssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState<AdminAssessmentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [requestConfirm, confirmDialog] = useConfirm();

  async function refresh() {
    if (!id) return;
    try {
      setAssessment(await getAdminAssessment(id));
    } catch (err) {
      setError(err instanceof ApiError ? `${err.status}: ${err.message}` : 'Failed to load assessment');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function runAction(fn: () => Promise<unknown>) {
    if (actionPending) return;
    setActionPending(true);
    setActionError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setActionPending(false);
    }
  }

  if (loading) return <div className="dashboard-body"><LoadingRow label="Loading assessment…" /></div>;
  if (error || !assessment) return <div className="dashboard-body"><ErrorState message={error ?? 'Not found'} /></div>;

  const isDraft = assessment.status === 'DRAFT';
  const isPublished = assessment.status === 'PUBLISHED';

  async function handleDeleteDraft() {
    const ok = await requestConfirm({
      title: 'Delete this draft assessment?',
      description: 'This permanently removes the assessment and its sections. Published assessments cannot be deleted.',
      confirmLabel: 'Delete assessment',
      confirmVariant: 'danger',
    });
    if (!ok) return;
    void runAction(async () => {
      await deleteAssessment(assessment!.id);
      navigate('/admin');
    });
  }

  return (
    <div className="dashboard-body">
      {confirmDialog}
      <Link to="/admin" className="back-link">
        <ArrowLeft size={14} /> Back to assessments
      </Link>

      <div className="page-header">
        <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {assessment.title} <StatusBadge status={assessment.effectiveStatus} />
        </h1>
      </div>

      {actionError && <ErrorState message={actionError} />}

      <div className="action-row">
        {!isDraft && (
          <Link to={`/admin/assessments/${assessment.id}/results`}>
            <button className="btn-secondary btn-icon">
              <Users size={15} /> View results
            </button>
          </Link>
        )}
        {isDraft && (
          <button className="btn-icon" disabled={actionPending} onClick={() => void runAction(() => publishAssessment(assessment.id))}>
            <PlayCircle size={15} /> Publish
          </button>
        )}
        {isPublished && assessment.effectiveStatus === 'PUBLISHED' && (
          <button
            className="btn-secondary"
            disabled={actionPending}
            onClick={() => void runAction(() => unpublishAssessment(assessment.id))}
          >
            Unpublish
          </button>
        )}
        {assessment.effectiveStatus === 'COMPLETED' && (
          <button
            className="btn-secondary"
            disabled={actionPending}
            onClick={() => void runAction(() => archiveAssessment(assessment.id))}
          >
            Archive
          </button>
        )}
        {isDraft && (
          <button className="btn-danger btn-icon" disabled={actionPending} onClick={() => void handleDeleteDraft()}>
            <Trash2 size={15} /> Delete
          </button>
        )}
      </div>

      <div className="card">
        <h2>Details</h2>
        <MetaForm assessment={assessment} onSaved={refresh} />
      </div>

      <div className="card">
        <h2>
          Sections ({assessment.sectionsCount}) · {assessment.questionsCount} question(s) · {assessment.maxMarks} marks
        </h2>
        <SectionsPanel assessment={assessment} onChanged={refresh} editable={isDraft} />
      </div>

      <div className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={17} /> Participants ({assessment.participantsCount})
        </h2>
        <ParticipantsPanel assessment={assessment} onChanged={refresh} />
      </div>
    </div>
  );
}

function MetaForm({ assessment, onSaved }: { assessment: AdminAssessmentDetail; onSaved: () => Promise<void> }) {
  const [description, setDescription] = useState(assessment.description ?? '');
  const [instructions, setInstructions] = useState(assessment.instructions ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isDraft = assessment.status === 'DRAFT';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updateAssessment(assessment.id, { description: description || null, instructions: instructions || null });
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <p style={{ margin: '0 0 0.8rem', color: 'var(--color-muted)', fontSize: '0.9rem' }}>
        Duration: {assessment.durationMinutes} min · {new Date(assessment.startAt).toLocaleString()} →{' '}
        {new Date(assessment.endAt).toLocaleString()}
        {!isDraft && ' (locked — unpublish to edit timing/duration/title)'}
      </p>
      <form onSubmit={handleSubmit} className="form-grid">
        <div className="field-full">
          <label htmlFor="desc">Description</label>
          <input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div className="field-full">
          <label htmlFor="instr">Instructions</label>
          <input id="instr" value={instructions} onChange={(e) => setInstructions(e.target.value)} style={{ width: '100%' }} />
        </div>
        {error && <p className="form-error field-full">{error}</p>}
        <div className="field-full">
          <button type="submit" className="btn-secondary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </>
  );
}

function SectionsPanel({
  assessment,
  onChanged,
  editable,
}: {
  assessment: AdminAssessmentDetail;
  onChanged: () => Promise<void>;
  editable: boolean;
}) {
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionType, setNewSectionType] = useState<'CODING' | 'MCQ'>('CODING');
  const [error, setError] = useState<string | null>(null);

  async function handleAddSection(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addSection(assessment.id, { title: newSectionTitle, sectionType: newSectionType });
      setNewSectionTitle('');
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add section');
    }
  }

  return (
    <>
      {assessment.sections.length === 0 && <p>No sections yet.</p>}
      {assessment.sections.map((section) => (
        <SectionBlock
          key={section.id}
          assessmentId={assessment.id}
          section={section}
          onChanged={onChanged}
          editable={editable}
        />
      ))}

      {editable && (
        <form onSubmit={handleAddSection} className="action-row" style={{ marginTop: '0.5rem' }}>
          <input
            placeholder="New section title (e.g. Coding Round)"
            value={newSectionTitle}
            onChange={(e) => setNewSectionTitle(e.target.value)}
            required
            style={{ marginBottom: 0, minWidth: 260 }}
          />
          <select value={newSectionType} onChange={(e) => setNewSectionType(e.target.value as 'CODING' | 'MCQ')}>
            <option value="CODING">Coding</option>
            <option value="MCQ">MCQ</option>
          </select>
          <button type="submit" className="btn-secondary btn-small">
            Add section
          </button>
        </form>
      )}
      {error && <p className="form-error">{error}</p>}
    </>
  );
}

function SectionBlock({
  assessmentId,
  section,
  onChanged,
  editable,
}: {
  assessmentId: string;
  section: AdminAssessmentDetail['sections'][number];
  onChanged: () => Promise<void>;
  editable: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  async function handleSelect(question: { id: string }) {
    setError(null);
    try {
      await attachQuestion(assessmentId, section.id, { questionId: question.id });
      setShowPicker(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to attach question');
    }
  }

  return (
    <div className="section-block">
      <h4>
        <span>
          {section.title} <QuestionTypeBadge type={section.sectionType} />
        </span>
        {editable && (
          <button
            className="btn-secondary btn-small"
            onClick={() => void removeSection(assessmentId, section.id).then(onChanged)}
          >
            Remove section
          </button>
        )}
      </h4>

      {section.questions.length === 0 ? (
        <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>No questions attached.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Difficulty</th>
              <th>Marks</th>
              {editable && <th />}
            </tr>
          </thead>
          <tbody>
            {section.questions.map((q) => (
              <tr key={q.id}>
                <td>{q.title}</td>
                <td>{q.difficulty}</td>
                <td>
                  {editable ? (
                    <input
                      type="number"
                      defaultValue={q.marks}
                      style={{ width: 70, marginBottom: 0 }}
                      onBlur={(e) => {
                        const value = Number(e.target.value);
                        if (value !== q.marks) {
                          void updateAssessmentQuestion(assessmentId, section.id, q.id, { marksOverride: value }).then(
                            onChanged,
                          );
                        }
                      }}
                    />
                  ) : (
                    q.marks
                  )}
                </td>
                {editable && (
                  <td>
                    <button
                      className="btn-secondary btn-small"
                      onClick={() => void detachQuestion(assessmentId, section.id, q.id).then(onChanged)}
                    >
                      Detach
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editable && (
        <div style={{ marginTop: '0.6rem' }}>
          <button type="button" className="btn-secondary btn-small" onClick={() => setShowPicker((v) => !v)}>
            {showPicker ? 'Close' : 'Add question'}
          </button>
          {showPicker && (
            <div style={{ marginTop: '0.6rem' }}>
              <QuestionPicker
                questionType={section.sectionType as 'CODING' | 'MCQ'}
                alreadyAttachedIds={section.questions.map((q) => q.questionId)}
                onSelect={handleSelect}
              />
            </div>
          )}
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

function ParticipantsPanel({
  assessment,
  onChanged,
}: {
  assessment: AdminAssessmentDetail;
  onChanged: () => Promise<void>;
}) {
  const [userIds, setUserIds] = useState('');
  const [department, setDepartment] = useState('');
  const [batch, setBatch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleAssignByIds(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    try {
      const ids = userIds.split(',').map((s) => s.trim()).filter(Boolean);
      const result = await assignParticipants(assessment.id, { userIds: ids });
      setInfo(`Added ${result.added}, already assigned ${result.alreadyAssigned}`);
      setUserIds('');
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign participants');
    }
  }

  async function handleAssignByGroup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    try {
      const result = await assignParticipants(assessment.id, {
        department: department || undefined,
        batch: batch || undefined,
      });
      setInfo(`Added ${result.added}, already assigned ${result.alreadyAssigned} (matched ${result.total})`);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign participants');
    }
  }

  return (
    <>
      {assessment.participants.length === 0 ? (
        <p>No participants assigned yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Source</th>
              <th>Started</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {assessment.participants.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.email}</td>
                <td>{p.source}{p.groupLabel ? ` (${p.groupLabel})` : ''}</td>
                <td>{p.hasStarted ? 'Yes' : 'No'}</td>
                <td>
                  <button
                    className="btn-secondary btn-small"
                    disabled={p.hasStarted}
                    title={p.hasStarted ? 'Cannot unassign — already started' : ''}
                    onClick={() => void unassignParticipant(assessment.id, p.userId).then(onChanged)}
                  >
                    Unassign
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="action-row" style={{ marginTop: '0.8rem' }}>
        <form onSubmit={handleAssignByIds} className="action-row">
          <input
            placeholder="Student user IDs, comma-separated"
            value={userIds}
            onChange={(e) => setUserIds(e.target.value)}
            style={{ marginBottom: 0, minWidth: 280 }}
          />
          <button type="submit" className="btn-secondary btn-small">
            Assign by ID
          </button>
        </form>
      </div>
      <div className="action-row">
        <form onSubmit={handleAssignByGroup} className="action-row">
          <input
            placeholder="Department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            style={{ marginBottom: 0, width: 160 }}
          />
          <input
            placeholder="Batch"
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            style={{ marginBottom: 0, width: 120 }}
          />
          <button type="submit" className="btn-secondary btn-small">
            Assign by department/batch
          </button>
        </form>
      </div>
      {info && <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>{info}</p>}
      {error && <p className="form-error">{error}</p>}
    </>
  );
}
