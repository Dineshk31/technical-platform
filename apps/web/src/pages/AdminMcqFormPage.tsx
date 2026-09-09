import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DIFFICULTY_LEVELS, MCQ_TOPICS, MCQ_TYPES } from '@technical-platform/shared';
import { ApiError } from '../lib/api-client';
import {
  createMcqQuestion,
  deleteQuestion,
  getQuestion,
  reviewQuestion,
  updateMcqQuestion,
  type McqQuestionDetail,
} from '../lib/questions-api';
import { ApprovalBadge, SourceBadge } from '../components/ApprovalBadge';
import { QuestionReviewPanel } from '../components/QuestionReviewPanel';
import { ErrorState } from '../components/ErrorState';
import { LoadingRow } from '../components/Skeleton';
import { useConfirm } from '../components/useConfirm';

interface OptionRow {
  optionText: string;
  isCorrect: boolean;
}

const EMPTY_OPTIONS: OptionRow[] = [
  { optionText: '', isCorrect: false },
  { optionText: '', isCorrect: false },
  { optionText: '', isCorrect: false },
  { optionText: '', isCorrect: false },
];

export function AdminMcqFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [question, setQuestion] = useState<McqQuestionDetail | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [marks, setMarks] = useState('5');
  const [mcqType, setMcqType] = useState<(typeof MCQ_TYPES)[number]>('SINGLE_CHOICE');
  const [questionText, setQuestionText] = useState('');
  const [codeSnippet, setCodeSnippet] = useState('');
  const [explanation, setExplanation] = useState('');
  const [difficulty, setDifficulty] = useState('EASY');
  const [topics, setTopics] = useState<string[]>([]);
  const [tagsText, setTagsText] = useState('');
  const [negativeMarkingValue, setNegativeMarkingValue] = useState('0');
  const [options, setOptions] = useState<OptionRow[]>(EMPTY_OPTIONS);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestConfirm, confirmDialog] = useConfirm();

  const isMultiAnswer = mcqType === 'MULTIPLE_CHOICE';

  useEffect(() => {
    if (!id) return;
    getQuestion(id)
      .then((q) => {
        if (q.type !== 'MCQ') {
          setLoadError('This question is not an MCQ — open it from the coding question editor instead.');
          return;
        }
        setQuestion(q);
        setTitle(q.title);
        setMarks(String(q.marks));
        setMcqType(q.mcqType as (typeof MCQ_TYPES)[number]);
        setQuestionText(q.questionText);
        setCodeSnippet(q.codeSnippet ?? '');
        setExplanation(q.explanation ?? '');
        setDifficulty(q.difficulty);
        setTopics(q.topics);
        setTagsText(q.tags.join(', '));
        setNegativeMarkingValue(String(q.negativeMarkingValue));
        setOptions(q.options.map((o) => ({ optionText: o.optionText, isCorrect: o.isCorrect })));
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Failed to load question'))
      .finally(() => setLoading(false));
  }, [id]);

  async function refreshQuestion() {
    if (!id) return;
    const q = await getQuestion(id);
    if (q.type === 'MCQ') setQuestion(q);
  }

  function toggleTopic(topic: string) {
    setTopics((prev) => (prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]));
  }

  function setOptionText(index: number, text: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, optionText: text } : o)));
  }

  function toggleOptionCorrect(index: number) {
    setOptions((prev) =>
      prev.map((o, i) => {
        if (i !== index) return isMultiAnswer ? o : { ...o, isCorrect: false };
        return { ...o, isCorrect: !o.isCorrect };
      }),
    );
  }

  function addOption() {
    setOptions((prev) => [...prev, { optionText: '', isCorrect: false }]);
  }

  function removeOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  function buildPayload() {
    return {
      title,
      marks: Number(marks),
      mcqType,
      questionText,
      codeSnippet: codeSnippet.trim() || undefined,
      explanation: explanation.trim() || undefined,
      difficulty: difficulty as (typeof DIFFICULTY_LEVELS)[number],
      topics: topics as (typeof MCQ_TOPICS)[number][],
      tags: tagsText.split(',').map((s) => s.trim()).filter(Boolean),
      negativeMarkingValue: Number(negativeMarkingValue),
      options: options.filter((o) => o.optionText.trim()).map((o) => ({ optionText: o.optionText.trim(), isCorrect: o.isCorrect })),
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit && id) {
        await updateMcqQuestion(id, buildPayload());
        await refreshQuestion();
      } else {
        const created = await createMcqQuestion(buildPayload());
        navigate(`/admin/questions/mcq/${created.id}/edit`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save question');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    const ok = await requestConfirm({
      title: 'Delete this question?',
      description: 'This permanently removes the question and cannot be undone.',
      confirmLabel: 'Delete question',
      confirmVariant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteQuestion(id);
      navigate('/admin/questions');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete question');
    }
  }

  async function handleReview(status: 'APPROVED' | 'NEEDS_EDIT' | 'REJECTED' | 'PENDING_REVIEW', notes?: string) {
    if (!id) return;
    await reviewQuestion(id, { status, notes });
    await refreshQuestion();
  }

  if (loading) return <div className="dashboard-body"><LoadingRow label="Loading question…" /></div>;
  if (loadError) return <div className="dashboard-body"><ErrorState message={loadError} /></div>;

  return (
    <div className="dashboard-body">
      {confirmDialog}
      <Link to="/admin/questions" className="back-link">
        <ArrowLeft size={14} /> Back to Question Bank
      </Link>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>{isEdit ? `Edit: ${question?.title ?? ''}` : 'New MCQ question'}</h1>
        {isEdit && question && (
          <div className="action-row" style={{ marginBottom: 0 }}>
            <SourceBadge source={question.source} />
            <ApprovalBadge status={question.approvalStatus} />
          </div>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="form-section">
            <h3>1. Basic information</h3>
            <div className="form-grid">
              <div className="field-full">
                <label>Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} required style={{ width: '100%' }} />
              </div>
              <div>
                <label>Marks</label>
                <input type="number" min={1} max={1000} value={marks} onChange={(e) => setMarks(e.target.value)} required />
              </div>
              <div>
                <label>Negative marking (on incorrect, optional)</label>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  step="0.5"
                  value={negativeMarkingValue}
                  onChange={(e) => setNegativeMarkingValue(e.target.value)}
                />
              </div>
              <div className="field-full">
                <label>Question type</label>
                <select value={mcqType} onChange={(e) => setMcqType(e.target.value as (typeof MCQ_TYPES)[number])}>
                  {MCQ_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace('_', ' ')}
                    </option>
                  ))}
                </select>
                <p className="field-hint" style={{ margin: '0.4rem 0 0' }}>
                  {isMultiAnswer
                    ? 'Multiple correct options may be selected — check every correct one below.'
                    : 'Exactly one correct option — checking a new one unchecks the previous choice.'}
                </p>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>2. Question</h3>
            <label>Question text</label>
            <textarea rows={4} value={questionText} onChange={(e) => setQuestionText(e.target.value)} required />
            <label>Code snippet (optional — shown above the question, e.g. for "what does this print")</label>
            <textarea rows={5} value={codeSnippet} onChange={(e) => setCodeSnippet(e.target.value)} style={{ fontFamily: 'monospace' }} />
          </div>

          <div className="form-section">
            <h3>3. Options</h3>
            <p className="field-hint" style={{ margin: '0 0 0.8rem' }}>
              At least two options are required. Mark the correct answer(s) with the checkbox — students never see
              this during the exam.
            </p>
            {options.map((option, i) => (
              <div key={i} className="repeatable-item action-row" style={{ alignItems: 'center' }}>
                <label className="checkbox-row" style={{ marginBottom: 0 }}>
                  <input type={isMultiAnswer ? 'checkbox' : 'radio'} checked={option.isCorrect} onChange={() => toggleOptionCorrect(i)} />
                  Correct
                </label>
                <input
                  value={option.optionText}
                  onChange={(e) => setOptionText(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  style={{ flex: 1, marginBottom: 0 }}
                />
                {options.length > 2 && (
                  <button type="button" className="btn-secondary btn-small" onClick={() => removeOption(i)}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn-secondary btn-small" onClick={addOption} disabled={options.length >= 8}>
              Add option
            </button>
          </div>

          <div className="form-section">
            <h3>4. Difficulty and topics</h3>
            <label>Difficulty</label>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={{ marginBottom: '1rem' }}>
              {DIFFICULTY_LEVELS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <label>Topics</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
              {MCQ_TOPICS.map((t) => (
                <label key={t} className="checkbox-row" style={{ marginBottom: 0, fontWeight: 400 }}>
                  <input type="checkbox" checked={topics.includes(t)} onChange={() => toggleTopic(t)} />
                  {t}
                </label>
              ))}
            </div>
            <label>Tags (comma-separated, optional)</label>
            <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} style={{ width: '100%' }} />
          </div>

          <div className="form-section">
            <h3>5. Explanation (optional)</h3>
            <p className="field-hint" style={{ margin: '0 0 0.8rem' }}>
              Shown to admins during review only — never sent to students, before or after the exam.
            </p>
            <textarea rows={3} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
          </div>

          <div className="form-section">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create question'}
            </button>
          </div>
        </div>
      </form>

      {isEdit && question && (
        <QuestionReviewPanel
          approvalStatus={question.approvalStatus}
          attachedToAssessments={question.attachedToAssessments}
          reviews={question.reviews}
          onReview={handleReview}
          onDelete={() => void handleDelete()}
        />
      )}
    </div>
  );
}
