import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, CircleAlert, Plus, X } from 'lucide-react';
import { CODING_TOPICS, type Topic } from '@technical-platform/shared';
import { TopicOptions } from '../components/TopicOptions';
import { ApiError } from '../lib/api-client';
import {
  createLesson,
  deleteLesson,
  getAdminLesson,
  updateLesson,
  type AdminLessonDetail,
  type LessonLinkedQuestion,
} from '../lib/learn-api';
import { useConfirm } from '../components/useConfirm';
import { useToast } from '../components/Toast';
import { Badge } from '../components/Badge';
import { ErrorState } from '../components/ErrorState';
import { LoadingRow } from '../components/Skeleton';
import { MarkdownField } from '../components/MarkdownField';
import { LessonQuestionPicker, type PickedQuestion } from '../components/LessonQuestionPicker';

const MAX_OBJECTIVES = 8;

/** Why an attached question would be refused by the server right now (Phase 18 rules). */
function linkProblem(q: LessonLinkedQuestion, role: 'CHECK' | 'PRACTICE'): string | undefined {
  if (q.approvalStatus !== 'APPROVED') return 'No longer approved — remove it or re-approve it in the Question Bank.';
  if (role === 'PRACTICE' && q.verificationStatus !== 'PASSED') {
    return 'Its reference solution is no longer verified — re-verify it in the Question Bank or remove it.';
  }
  return undefined;
}

const toPicked = (role: 'CHECK' | 'PRACTICE') => (q: LessonLinkedQuestion): PickedQuestion => ({
  questionId: q.questionId,
  title: q.title,
  difficulty: q.difficulty,
  problem: linkProblem(q, role),
});

/**
 * Lesson authoring (Phase 18): objectives → Markdown content with live preview →
 * deliberately attached knowledge checks and verified practice problems → save as a
 * draft → review checklist → publish. Nothing a student sees changes until Publish.
 */
export function AdminLessonFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [requestConfirm, confirmDialog] = useConfirm();

  const [lesson, setLesson] = useState<AdminLessonDetail | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [topic, setTopic] = useState<Topic>(CODING_TOPICS[0]);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [objectives, setObjectives] = useState<string[]>(['']);
  const [concept, setConcept] = useState('');
  const [example, setExample] = useState('');
  const [commonMistakes, setCommonMistakes] = useState('');
  const [checks, setChecks] = useState<PickedQuestion[]>([]);
  const [practice, setPractice] = useState<PickedQuestion[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function applyLesson(l: AdminLessonDetail) {
    setLesson(l);
    setTopic(l.topic as Topic);
    setTitle(l.title);
    setSummary(l.summary);
    setObjectives(l.objectives.length ? l.objectives : ['']);
    setConcept(l.concept);
    setExample(l.example ?? '');
    setCommonMistakes(l.commonMistakes ?? '');
    setChecks(l.checks.map(toPicked('CHECK')));
    setPractice(l.practice.map(toPicked('PRACTICE')));
  }

  useEffect(() => {
    if (!id) return;
    getAdminLesson(id)
      .then(applyLesson)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Failed to load lesson'))
      .finally(() => setLoading(false));
  }, [id]);

  function buildPayload() {
    return {
      topic,
      title,
      summary,
      objectives: objectives.map((o) => o.trim()).filter(Boolean),
      concept,
      example: example.trim() || undefined,
      commonMistakes: commonMistakes.trim() || undefined,
      checkQuestionIds: checks.map((c) => c.questionId),
      practiceQuestionIds: practice.map((p) => p.questionId),
    };
  }

  function describeError(err: unknown, fallback: string): string {
    if (!(err instanceof ApiError)) return fallback;
    const details = (err.details ?? []) as { issue?: string }[];
    const issues = details.map((d) => d.issue).filter(Boolean);
    return issues.length ? `${err.message}: ${issues.join('; ')}` : err.message;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit && id) {
        applyLesson(await updateLesson(id, buildPayload()));
        showToast('success', lesson?.isPublished ? 'Lesson saved — students see the update now.' : 'Draft saved.');
      } else {
        const created = await createLesson(buildPayload());
        showToast('success', 'Lesson created as a draft — review it, then publish when ready.');
        navigate(`/admin/lessons/${created.id}/edit`);
      }
    } catch (err) {
      setError(describeError(err, 'Failed to save lesson'));
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePublish() {
    if (!id || !lesson) return;
    const nextState = !lesson.isPublished;
    if (lesson.isPublished) {
      const ok = await requestConfirm({
        title: 'Unpublish this lesson?',
        description: 'Students will no longer be able to open it. Their existing progress on it is kept.',
        confirmLabel: 'Unpublish',
        confirmVariant: 'danger',
      });
      if (!ok) return;
    }
    try {
      applyLesson(await updateLesson(id, { isPublished: nextState }));
      showToast('success', nextState ? 'Lesson published — students can now see it.' : 'Lesson unpublished.');
    } catch (err) {
      showToast('error', describeError(err, 'Failed to update lesson'));
    }
  }

  async function handleDelete() {
    if (!id || !lesson) return;
    const ok = await requestConfirm({
      title: `Delete "${lesson.title}"?`,
      description: 'This permanently removes the lesson and any student progress on it. This cannot be undone.',
      confirmLabel: 'Delete lesson',
      confirmVariant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteLesson(id);
      navigate('/admin/lessons');
    } catch (err) {
      showToast('error', err instanceof ApiError ? err.message : 'Failed to delete lesson');
    }
  }

  if (loading) return <div className="dashboard-body"><LoadingRow label="Loading lesson…" /></div>;
  if (loadError) return <div className="dashboard-body"><ErrorState message={loadError} /></div>;

  // Review checklist reflects what is saved (the server's view), not unsaved edits.
  const saved = lesson;
  const staleLinks = saved ? [...saved.checks.map(toPicked('CHECK')), ...saved.practice.map(toPicked('PRACTICE'))].filter((p) => p.problem) : [];
  const checklist = saved
    ? [
        { ok: saved.objectives.length > 0, label: 'Learning objectives written', required: false },
        { ok: saved.checks.length > 0, label: 'At least one knowledge check attached', required: false },
        { ok: saved.practice.length > 0, label: 'Practice problems attached', required: false },
        { ok: staleLinks.length === 0, label: 'Every attached question is approved (and practice problems verified)', required: true },
      ]
    : [];
  const blocked = checklist.some((c) => c.required && !c.ok);

  return (
    <div className="dashboard-body">
      {confirmDialog}
      <Link to="/admin/lessons" className="back-link">
        <ArrowLeft size={14} /> Back to Lessons
      </Link>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>{isEdit ? `Edit: ${lesson?.title ?? ''}` : 'New lesson'}</h1>
        {isEdit && lesson && (
          <div className="action-row" style={{ marginBottom: 0 }}>
            <Badge variant={lesson.isPublished ? 'success' : 'neutral'}>{lesson.isPublished ? 'Published' : 'Draft'}</Badge>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="form-section">
            <h3>1. Basic information</h3>
            <div className="form-grid">
              <div>
                <label htmlFor="lesson-topic">Topic</label>
                <select id="lesson-topic" value={topic} onChange={(e) => setTopic(e.target.value as Topic)}>
                  <TopicOptions />
                </select>
              </div>
              <div className="field-full">
                <label htmlFor="lesson-title">Title</label>
                <input id="lesson-title" value={title} onChange={(e) => setTitle(e.target.value)} required style={{ width: '100%' }} />
              </div>
              <div className="field-full">
                <label htmlFor="lesson-summary">Summary (shown in lesson lists — 1-2 sentences)</label>
                <textarea id="lesson-summary" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} required />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>2. What students will learn</h3>
            <p className="field-hint" style={{ marginTop: 0 }}>
              Short, concrete outcomes shown at the top of the lesson — e.g. "Explain why index access is O(1)".
            </p>
            {objectives.map((o, i) => (
              <div key={i} className="objective-row">
                <input
                  aria-label={`Objective ${i + 1}`}
                  value={o}
                  maxLength={200}
                  onChange={(e) => setObjectives((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))}
                  style={{ flex: 1, marginBottom: 0 }}
                />
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  aria-label={`Remove objective ${i + 1}`}
                  onClick={() => setObjectives((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : ['']))}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            {objectives.length < MAX_OBJECTIVES && (
              <button type="button" className="btn-secondary btn-small btn-icon" onClick={() => setObjectives((prev) => [...prev, ''])}>
                <Plus size={13} /> Add objective
              </button>
            )}
          </div>

          <div className="form-section">
            <h3>3. Lesson content</h3>
            <MarkdownField
              label="Explanation"
              hint="Markdown: ## headings, **bold**, lists, and fenced code blocks with a language (```python). Raw HTML is not rendered."
              value={concept}
              onChange={setConcept}
              rows={14}
              required
            />
          </div>

          <div className="form-section">
            <h3>4. Worked example (optional)</h3>
            <MarkdownField label="Worked example" value={example} onChange={setExample} rows={10} />
          </div>

          <div className="form-section">
            <h3>5. Common mistakes (optional)</h3>
            <MarkdownField label="Common mistakes" value={commonMistakes} onChange={setCommonMistakes} rows={6} />
          </div>

          <div className="form-section">
            <h3>6. Knowledge checks</h3>
            <p className="field-hint" style={{ marginTop: 0 }}>
              Approved MCQs the student must answer correctly to complete the lesson. Graded on the server; the explanation is shown
              after they answer.
            </p>
            <LessonQuestionPicker kind="CHECK" topic={topic} picked={checks} onChange={setChecks} />
          </div>

          <div className="form-section">
            <h3>7. Practice what you just learned</h3>
            <p className="field-hint" style={{ marginTop: 0 }}>
              Specific coding problems offered once the lesson is passed. Only problems whose reference solution passed verification can be
              attached.
            </p>
            <LessonQuestionPicker kind="PRACTICE" topic={topic} picked={practice} onChange={setPractice} />
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-section">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? (lesson?.isPublished ? 'Save changes' : 'Save draft') : 'Create draft'}
            </button>
          </div>
        </div>
      </form>

      {isEdit && lesson && (
        <div className="card">
          <h2>Review &amp; publish</h2>
          <p className="field-hint">
            {lesson.isPublished
              ? 'This lesson is live — students can open it from Learn.'
              : 'This lesson is a draft — only visible here, not to students.'}
          </p>
          <ul className="review-checklist">
            {checklist.map((c) => (
              <li key={c.label} className={c.ok ? 'ok' : c.required ? 'blocking' : 'optional'}>
                {c.ok ? <Check size={14} aria-hidden="true" /> : <CircleAlert size={14} aria-hidden="true" />}
                <span>
                  {c.label}
                  {!c.ok && !c.required && <span className="field-hint"> — recommended</span>}
                </span>
              </li>
            ))}
          </ul>
          <div className="action-row">
            <button
              className={lesson.isPublished ? 'btn-secondary btn-icon' : 'btn-icon'}
              onClick={() => void handleTogglePublish()}
              disabled={!lesson.isPublished && blocked}
            >
              {lesson.isPublished ? 'Unpublish' : 'Publish'}
            </button>
            <button className="btn-danger btn-icon" onClick={() => void handleDelete()}>
              Delete lesson
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
