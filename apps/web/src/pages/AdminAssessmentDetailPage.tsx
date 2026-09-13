import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, PlayCircle, Trash2, Users } from 'lucide-react';
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
import { Stepper, type StepDefinition } from '../components/Stepper';
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
        <div className="action-row" style={{ marginBottom: 0 }}>
          {!isDraft && (
            <Link to={`/admin/assessments/${assessment.id}/results`}>
              <button className="btn-secondary btn-icon">
                <Users size={15} /> View results
              </button>
            </Link>
          )}
          {isPublished && assessment.effectiveStatus === 'PUBLISHED' && (
            <button className="btn-secondary" disabled={actionPending} onClick={() => void runAction(() => unpublishAssessment(assessment.id))}>
              Unpublish
            </button>
          )}
          {assessment.effectiveStatus === 'COMPLETED' && (
            <button className="btn-secondary" disabled={actionPending} onClick={() => void runAction(() => archiveAssessment(assessment.id))}>
              Archive
            </button>
          )}
          {isDraft && (
            <button className="btn-danger btn-icon" disabled={actionPending} onClick={() => void handleDeleteDraft()}>
              <Trash2 size={15} /> Delete draft
            </button>
          )}
        </div>
      </div>

      {actionError && <ErrorState message={actionError} />}

      {isDraft ? (
        <DraftBuilder assessment={assessment} onChanged={refresh} requestConfirm={requestConfirm} />
      ) : (
        <PublishedView assessment={assessment} onChanged={refresh} />
      )}
    </div>
  );
}

// ============================================================
// DRAFT — the guided, step-based builder
// ============================================================

type BuilderStepKey = 'details' | 'questions' | 'participants' | 'review';

function DraftBuilder({
  assessment,
  onChanged,
  requestConfirm,
}: {
  assessment: AdminAssessmentDetail;
  onChanged: () => Promise<void>;
  requestConfirm: ReturnType<typeof useConfirm>[0];
}) {
  const [step, setStep] = useState<BuilderStepKey>('details');

  const hasSections = assessment.sectionsCount > 0;
  const everySectionHasQuestions = assessment.sections.length > 0 && assessment.sections.every((s) => s.questions.length > 0);
  const hasParticipants = assessment.participantsCount > 0;
  const validWindow = new Date(assessment.endAt) > new Date(assessment.startAt) && new Date(assessment.endAt) > new Date();

  const steps: StepDefinition[] = [
    { key: 'details', label: 'Assessment details', hint: `${assessment.durationMinutes} min window`, done: validWindow },
    {
      key: 'questions',
      label: 'Build assessment',
      hint: `${assessment.sectionsCount} section(s) · ${assessment.questionsCount} question(s)`,
      done: hasSections && everySectionHasQuestions,
    },
    { key: 'participants', label: 'Participants', hint: `${assessment.participantsCount} assigned`, done: hasParticipants },
    { key: 'review', label: 'Review & publish' },
  ];

  return (
    <>
      <Stepper steps={steps} currentKey={step} onSelect={(k) => setStep(k as BuilderStepKey)} />

      {step === 'details' && (
        <div className="card">
          <h2>Assessment details</h2>
          <MetaForm assessment={assessment} onSaved={onChanged} />
        </div>
      )}

      {step === 'questions' && (
        <div className="card">
          <h2>
            Sections ({assessment.sectionsCount}) · {assessment.questionsCount} question(s) · {assessment.maxMarks} marks
          </h2>
          <SectionsPanel assessment={assessment} onChanged={onChanged} editable />
        </div>
      )}

      {step === 'participants' && (
        <div className="card">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={17} /> Participants ({assessment.participantsCount})
          </h2>
          <ParticipantsPanel assessment={assessment} onChanged={onChanged} />
        </div>
      )}

      {step === 'review' && (
        <ReviewAndPublish
          assessment={assessment}
          checklist={{ hasSections, everySectionHasQuestions, hasParticipants, validWindow }}
          onChanged={onChanged}
          requestConfirm={requestConfirm}
          goToStep={setStep}
        />
      )}
    </>
  );
}

function ReviewAndPublish({
  assessment,
  checklist,
  onChanged,
  requestConfirm,
  goToStep,
}: {
  assessment: AdminAssessmentDetail;
  checklist: { hasSections: boolean; everySectionHasQuestions: boolean; hasParticipants: boolean; validWindow: boolean };
  onChanged: () => Promise<void>;
  requestConfirm: ReturnType<typeof useConfirm>[0];
  goToStep: (key: BuilderStepKey) => void;
}) {
  const [publishIssues, setPublishIssues] = useState<{ field?: string; issue: string }[] | null>(null);
  const [publishing, setPublishing] = useState(false);

  const localChecklist = [
    { key: 'window', label: 'Valid time window (end after start, end in the future)', ok: checklist.validWindow, step: 'details' as const },
    { key: 'sections', label: 'At least one section', ok: checklist.hasSections, step: 'questions' as const },
    { key: 'questions', label: 'Every section has at least one question', ok: checklist.everySectionHasQuestions, step: 'questions' as const },
    { key: 'participants', label: 'At least one participant assigned', ok: checklist.hasParticipants, step: 'participants' as const },
  ];
  const allLocalChecksPass = localChecklist.every((c) => c.ok);

  return (
    <div className="card">
      <h2>Review & publish</h2>
      <p className="field-hint" style={{ marginTop: 0 }}>
        {assessment.sectionsCount} section(s) · {assessment.questionsCount} question(s) · {assessment.maxMarks} marks ·{' '}
        {assessment.participantsCount} participant(s)
      </p>

      <div className="checklist">
        {localChecklist.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`checklist-item ${c.ok ? 'ok' : 'pending'}`}
            style={{ border: 'none', width: '100%', cursor: 'pointer' }}
            onClick={() => goToStep(c.step)}
          >
            {c.ok ? <Check size={14} /> : <span style={{ width: 14 }} />} {c.label}
          </button>
        ))}
        <div className="checklist-item" style={{ background: 'var(--color-surface-secondary)', color: 'var(--color-muted)' }}>
          Every attached question is currently APPROVED, and its test cases/options are still valid — checked by the
          server the moment you click Publish below.
        </div>
      </div>

      {publishIssues && publishIssues.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <p className="form-error" style={{ marginBottom: '0.4rem' }}>
            The server blocked publishing for these reasons:
          </p>
          <ul>
            {publishIssues.map((issue, i) => (
              <li key={i} style={{ color: 'var(--color-error)', fontSize: '0.85rem' }}>
                {issue.issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="action-row" style={{ marginTop: '1.2rem' }}>
        <button
          className="btn-icon"
          disabled={publishing}
          onClick={async () => {
            const okToProceed = await requestConfirm({
              title: 'Publish this assessment?',
              description: `"${assessment.title}" will become visible to its assigned participants and cannot have its questions or timing changed afterward.${allLocalChecksPass ? '' : ' Some checks above are still incomplete — publishing will likely be rejected until they are fixed.'}`,
              confirmLabel: 'Publish assessment',
              confirmVariant: 'success',
            });
            if (!okToProceed) return;
            setPublishIssues(null);
            setPublishing(true);
            try {
              await publishAssessment(assessment.id);
              await onChanged();
            } catch (err) {
              if (err instanceof ApiError && err.details) {
                setPublishIssues(err.details);
              } else if (err instanceof ApiError) {
                setPublishIssues([{ issue: err.message }]);
              }
            } finally {
              setPublishing(false);
            }
          }}
        >
          <PlayCircle size={15} /> {publishing ? 'Publishing…' : 'Publish'}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// PUBLISHED / COMPLETED / ARCHIVED — the locked detail view
// ============================================================

function PublishedView({ assessment, onChanged }: { assessment: AdminAssessmentDetail; onChanged: () => Promise<void> }) {
  return (
    <>
      <div className="card">
        <h2>Details</h2>
        <MetaForm assessment={assessment} onSaved={onChanged} />
      </div>

      <div className="card">
        <h2>
          Sections ({assessment.sectionsCount}) · {assessment.questionsCount} question(s) · {assessment.maxMarks} marks
        </h2>
        <SectionsPanel assessment={assessment} onChanged={onChanged} editable={false} />
      </div>

      <div className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={17} /> Participants ({assessment.participantsCount})
        </h2>
        <ParticipantsPanel assessment={assessment} onChanged={onChanged} />
      </div>
    </>
  );
}

// ============================================================
// Shared step content (used by both the draft builder and the locked view)
// ============================================================

function MetaForm({ assessment, onSaved }: { assessment: AdminAssessmentDetail; onSaved: () => Promise<void> }) {
  const isDraft = assessment.status === 'DRAFT';
  const [title, setTitle] = useState(assessment.title);
  const [description, setDescription] = useState(assessment.description ?? '');
  const [instructions, setInstructions] = useState(assessment.instructions ?? '');
  const [durationMinutes, setDurationMinutes] = useState(assessment.durationMinutes);
  const [startAt, setStartAt] = useState(toLocalInputValue(assessment.startAt));
  const [endAt, setEndAt] = useState(toLocalInputValue(assessment.endAt));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await updateAssessment(assessment.id, {
        title: isDraft ? title : undefined,
        description: description || null,
        instructions: instructions || null,
        durationMinutes: isDraft ? durationMinutes : undefined,
        startAt: isDraft ? new Date(startAt) : undefined,
        endAt: isDraft ? new Date(endAt) : undefined,
      });
      setSaved(true);
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (!isDraft) {
    return (
      <>
        <p style={{ margin: '0 0 0.8rem', color: 'var(--color-muted)', fontSize: '0.9rem' }}>
          Duration: {assessment.durationMinutes} min · {new Date(assessment.startAt).toLocaleString()} →{' '}
          {new Date(assessment.endAt).toLocaleString()} (locked — unpublish to edit timing/duration/title)
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
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        </form>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid">
      <div className="field-full">
        <label htmlFor="title">Title</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required style={{ width: '100%' }} />
      </div>
      <div className="field-full">
        <label htmlFor="description">Description</label>
        <input id="description" value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: '100%' }} />
      </div>
      <div className="field-full">
        <label htmlFor="instr">Instructions</label>
        <input id="instr" value={instructions} onChange={(e) => setInstructions(e.target.value)} style={{ width: '100%' }} />
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
        <button type="submit" className="btn-secondary" disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save details'}
        </button>
      </div>
    </form>
  );
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
      {assessment.sections.length === 0 && (
        <p style={{ color: 'var(--color-muted)' }}>
          No sections yet. {editable ? 'Add one below to start attaching questions.' : ''}
        </p>
      )}
      {assessment.sections.map((section) => (
        <SectionBlock key={section.id} assessmentId={assessment.id} section={section} onChanged={onChanged} editable={editable} />
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
        <p style={{ color: 'var(--color-muted)' }}>No participants assigned yet.</p>
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
