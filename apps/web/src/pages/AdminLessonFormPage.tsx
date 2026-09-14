import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { CODING_TOPICS, type CodingTopic } from '@technical-platform/shared';
import { ApiError } from '../lib/api-client';
import { createLesson, deleteLesson, getAdminLesson, updateLesson, type AdminLessonDetail } from '../lib/learn-api';
import { useConfirm } from '../components/useConfirm';
import { useToast } from '../components/Toast';
import { Badge } from '../components/Badge';
import { ErrorState } from '../components/ErrorState';
import { LoadingRow } from '../components/Skeleton';

export function AdminLessonFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [requestConfirm, confirmDialog] = useConfirm();

  const [lesson, setLesson] = useState<AdminLessonDetail | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [topic, setTopic] = useState<CodingTopic>(CODING_TOPICS[0]);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [concept, setConcept] = useState('');
  const [example, setExample] = useState('');
  const [commonMistakes, setCommonMistakes] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    getAdminLesson(id)
      .then((l) => {
        setLesson(l);
        setTopic(l.topic as CodingTopic);
        setTitle(l.title);
        setSummary(l.summary);
        setConcept(l.concept);
        setExample(l.example ?? '');
        setCommonMistakes(l.commonMistakes ?? '');
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Failed to load lesson'))
      .finally(() => setLoading(false));
  }, [id]);

  function buildPayload() {
    return {
      topic,
      title,
      summary,
      concept,
      example: example.trim() || undefined,
      commonMistakes: commonMistakes.trim() || undefined,
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit && id) {
        const updated = await updateLesson(id, buildPayload());
        setLesson(updated);
        showToast('success', 'Lesson saved.');
      } else {
        const created = await createLesson(buildPayload());
        showToast('success', 'Lesson created as a draft — publish it when ready.');
        navigate(`/admin/lessons/${created.id}/edit`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save lesson');
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
      const updated = await updateLesson(id, { isPublished: nextState });
      setLesson(updated);
      showToast('success', nextState ? 'Lesson published — students can now see it.' : 'Lesson unpublished.');
    } catch (err) {
      showToast('error', err instanceof ApiError ? err.message : 'Failed to update lesson');
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

      {error && <p className="form-error">{error}</p>}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="form-section">
            <h3>1. Basic information</h3>
            <div className="form-grid">
              <div>
                <label>Topic</label>
                <select value={topic} onChange={(e) => setTopic(e.target.value as CodingTopic)}>
                  {CODING_TOPICS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-full">
                <label>Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} required style={{ width: '100%' }} />
              </div>
              <div className="field-full">
                <label>Summary (shown in lesson lists — 1-2 sentences)</label>
                <textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} required />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>2. Concept</h3>
            <label>The core explanation this lesson teaches</label>
            <textarea rows={8} value={concept} onChange={(e) => setConcept(e.target.value)} required />
          </div>

          <div className="form-section">
            <h3>3. Example (optional)</h3>
            <label>A worked example — plain text or a code block</label>
            <textarea rows={6} value={example} onChange={(e) => setExample(e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
          </div>

          <div className="form-section">
            <h3>4. Common mistakes (optional)</h3>
            <textarea rows={4} value={commonMistakes} onChange={(e) => setCommonMistakes(e.target.value)} />
          </div>

          <div className="form-section">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create lesson'}
            </button>
          </div>
        </div>
      </form>

      {isEdit && lesson && (
        <div className="card">
          <h2>Publishing</h2>
          <p className="field-hint">
            {lesson.isPublished
              ? 'This lesson is live — students can open it from Learn.'
              : 'This lesson is a draft — only visible here, not to students.'}
          </p>
          <div className="action-row">
            <button className={lesson.isPublished ? 'btn-secondary btn-icon' : 'btn-icon'} onClick={() => void handleTogglePublish()}>
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
