import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CODING_TOPICS, DIFFICULTY_LEVELS, PROGRAMMING_LANGUAGES } from '@technical-platform/shared';
import { ApiError } from '../lib/api-client';
import {
  addTestCase,
  createQuestion,
  deleteQuestion,
  getQuestion,
  removeTestCase,
  reviewQuestion,
  updateQuestion,
  updateTestCase,
  type QuestionDetail,
  type TestCaseItem,
} from '../lib/questions-api';
import { ApprovalBadge } from '../components/ApprovalBadge';

interface ExampleRow {
  input: string;
  output: string;
  explanation: string;
}
interface TestCaseRow {
  input: string;
  expectedOutput: string;
}

export function AdminQuestionFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [question, setQuestion] = useState<QuestionDetail | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [marks, setMarks] = useState('10');
  const [problemStatement, setProblemStatement] = useState('');
  const [inputFormat, setInputFormat] = useState('');
  const [outputFormat, setOutputFormat] = useState('');
  const [constraintsText, setConstraintsText] = useState('');
  const [examples, setExamples] = useState<ExampleRow[]>([{ input: '', output: '', explanation: '' }]);
  const [difficulty, setDifficulty] = useState('EASY');
  const [topics, setTopics] = useState<string[]>([]);
  const [tagsText, setTagsText] = useState('');
  const [timeLimitSeconds, setTimeLimitSeconds] = useState('2');
  const [memoryLimitMb, setMemoryLimitMb] = useState('256');
  const [supportedLanguages, setSupportedLanguages] = useState<string[]>(['CPP', 'JAVA', 'PYTHON']);
  const [referenceSolutions, setReferenceSolutions] = useState<Record<string, string>>({});
  const [starterTemplates, setStarterTemplates] = useState<Record<string, string>>({});
  const [publicTestCases, setPublicTestCases] = useState<TestCaseRow[]>([{ input: '', expectedOutput: '' }]);
  const [hiddenTestCases, setHiddenTestCases] = useState<TestCaseRow[]>([{ input: '', expectedOutput: '' }]);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    getQuestion(id)
      .then((q) => {
        setQuestion(q);
        setTitle(q.title);
        setMarks(String(q.marks));
        setProblemStatement(q.problemStatement);
        setInputFormat(q.inputFormat);
        setOutputFormat(q.outputFormat);
        setConstraintsText(q.constraints.join('\n'));
        setExamples(q.examples.length ? q.examples.map((e) => ({ input: e.input, output: e.output, explanation: e.explanation ?? '' })) : [{ input: '', output: '', explanation: '' }]);
        setDifficulty(q.difficulty);
        setTopics(q.topics);
        setTagsText(q.tags.join(', '));
        setTimeLimitSeconds(String(q.timeLimitSeconds));
        setMemoryLimitMb(String(q.memoryLimitMb));
        setSupportedLanguages(q.supportedLanguages);
        setReferenceSolutions(Object.fromEntries(q.referenceSolutions.map((r) => [r.language, r.code])));
        setStarterTemplates(Object.fromEntries(q.starterTemplates.map((s) => [s.language, s.code])));
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Failed to load question'))
      .finally(() => setLoading(false));
  }, [id]);

  async function refreshQuestion() {
    if (!id) return;
    setQuestion(await getQuestion(id));
  }

  function toggleTopic(topic: string) {
    setTopics((prev) => (prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]));
  }

  function toggleLanguage(lang: string) {
    setSupportedLanguages((prev) => (prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]));
  }

  function buildMetadataPayload() {
    return {
      title,
      marks: Number(marks),
      problemStatement,
      inputFormat,
      outputFormat,
      constraints: constraintsText.split('\n').map((s) => s.trim()).filter(Boolean),
      examples: examples
        .filter((e) => e.input.trim() && e.output.trim())
        .map((e) => ({ input: e.input, output: e.output, explanation: e.explanation.trim() || undefined })),
      difficulty: difficulty as (typeof DIFFICULTY_LEVELS)[number],
      topics: topics as (typeof CODING_TOPICS)[number][],
      tags: tagsText.split(',').map((s) => s.trim()).filter(Boolean),
      timeLimitSeconds: Number(timeLimitSeconds),
      memoryLimitMb: Number(memoryLimitMb),
      supportedLanguages: supportedLanguages as (typeof PROGRAMMING_LANGUAGES)[number][],
      referenceSolutions: Object.fromEntries(
        Object.entries(referenceSolutions).filter(([lang, code]) => supportedLanguages.includes(lang) && code.trim()),
      ),
      starterTemplates: Object.fromEntries(
        Object.entries(starterTemplates).filter(([lang, code]) => supportedLanguages.includes(lang) && code.trim()),
      ),
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit && id) {
        await updateQuestion(id, buildMetadataPayload());
        await refreshQuestion();
      } else {
        const created = await createQuestion({
          ...buildMetadataPayload(),
          publicTestCases: publicTestCases.filter((tc) => tc.input.trim() && tc.expectedOutput.trim()),
          hiddenTestCases: hiddenTestCases.filter((tc) => tc.input.trim() && tc.expectedOutput.trim()),
        });
        navigate(`/admin/questions/${created.id}/edit`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save question');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id || !window.confirm('Delete this question permanently?')) return;
    try {
      await deleteQuestion(id);
      navigate('/admin/questions');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete question');
    }
  }

  async function handleReview(status: string) {
    if (!id) return;
    setError(null);
    try {
      await reviewQuestion(id, { status: status as never });
      await refreshQuestion();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update review status');
    }
  }

  if (loading) return <div className="dashboard-body">Loading…</div>;
  if (loadError) return <div className="dashboard-body form-error">{loadError}</div>;

  return (
    <div className="dashboard-body">
      <Link to="/admin/questions" className="back-link">
        ← Back to Question Bank
      </Link>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>{isEdit ? `Edit: ${question?.title ?? ''}` : 'New coding question'}</h1>
        {isEdit && question && <ApprovalBadge status={question.approvalStatus} />}
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
            </div>
          </div>

          <div className="form-section">
            <h3>2. Problem statement</h3>
            <textarea rows={5} value={problemStatement} onChange={(e) => setProblemStatement(e.target.value)} required />
          </div>

          <div className="form-section">
            <h3>3. Input / Output format</h3>
            <label>Input format</label>
            <textarea rows={2} value={inputFormat} onChange={(e) => setInputFormat(e.target.value)} required />
            <label>Output format</label>
            <textarea rows={2} value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)} required />
          </div>

          <div className="form-section">
            <h3>4. Constraints (one per line)</h3>
            <textarea rows={3} value={constraintsText} onChange={(e) => setConstraintsText(e.target.value)} />
          </div>

          <div className="form-section">
            <h3>5. Examples</h3>
            {examples.map((ex, i) => (
              <div key={i} className="repeatable-item">
                <label>Input</label>
                <textarea rows={2} value={ex.input} onChange={(e) => setExamples((p) => p.map((x, idx) => (idx === i ? { ...x, input: e.target.value } : x)))} />
                <label>Output</label>
                <textarea rows={2} value={ex.output} onChange={(e) => setExamples((p) => p.map((x, idx) => (idx === i ? { ...x, output: e.target.value } : x)))} />
                <label>Explanation (optional)</label>
                <textarea rows={2} value={ex.explanation} onChange={(e) => setExamples((p) => p.map((x, idx) => (idx === i ? { ...x, explanation: e.target.value } : x)))} />
                {examples.length > 1 && (
                  <button type="button" className="btn-secondary btn-small" onClick={() => setExamples((p) => p.filter((_, idx) => idx !== i))}>
                    Remove example
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn-secondary btn-small" onClick={() => setExamples((p) => [...p, { input: '', output: '', explanation: '' }])}>
              Add example
            </button>
          </div>

          <div className="form-section">
            <h3>6. Difficulty and topics</h3>
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
              {CODING_TOPICS.map((t) => (
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
            <h3>7. Limits and languages</h3>
            <div className="form-grid">
              <div>
                <label>Time limit (seconds)</label>
                <input type="number" step="0.5" min={0.5} max={10} value={timeLimitSeconds} onChange={(e) => setTimeLimitSeconds(e.target.value)} required />
              </div>
              <div>
                <label>Memory limit (MB)</label>
                <input type="number" min={16} max={1024} value={memoryLimitMb} onChange={(e) => setMemoryLimitMb(e.target.value)} required />
              </div>
              <div className="field-full">
                <label>Supported languages</label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  {PROGRAMMING_LANGUAGES.map((lang) => (
                    <label key={lang} className="checkbox-row" style={{ fontWeight: 400 }}>
                      <input type="checkbox" checked={supportedLanguages.includes(lang)} onChange={() => toggleLanguage(lang)} />
                      {lang}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {!isEdit && (
            <>
              <div className="form-section">
                <h3>8. Public test cases (visible to students)</h3>
                <TestCaseArrayEditor rows={publicTestCases} onChange={setPublicTestCases} />
              </div>
              <div className="form-section">
                <h3>9. Hidden test cases (never exposed to students)</h3>
                <TestCaseArrayEditor rows={hiddenTestCases} onChange={setHiddenTestCases} />
              </div>
            </>
          )}

          <div className="form-section">
            <h3>10. Reference solutions</h3>
            <p className="field-hint" style={{ margin: '0 0 0.8rem' }}>
              At least one reference solution, for a supported language, is required.
            </p>
            {supportedLanguages.map((lang) => (
              <div key={lang}>
                <label>{lang}</label>
                <textarea
                  rows={4}
                  value={referenceSolutions[lang] ?? ''}
                  onChange={(e) => setReferenceSolutions((p) => ({ ...p, [lang]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <div className="form-section">
            <h3>Starter code templates (optional)</h3>
            <p className="field-hint" style={{ margin: '0 0 0.8rem' }}>
              Shown to students before they write anything. Leave a language blank to fall back to a generic
              template for that language.
            </p>
            {supportedLanguages.map((lang) => (
              <div key={lang}>
                <label>{lang}</label>
                <textarea
                  rows={4}
                  value={starterTemplates[lang] ?? ''}
                  onChange={(e) => setStarterTemplates((p) => ({ ...p, [lang]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <div className="form-section">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create question'}
            </button>
          </div>
        </div>
      </form>

      {isEdit && question && (
        <>
          <div className="card">
            <h2>8/9. Test cases</h2>
            <TestCaseLiveEditor questionId={question.id} testCases={question.publicTestCases} isHidden={false} onChanged={refreshQuestion} />
            <TestCaseLiveEditor questionId={question.id} testCases={question.hiddenTestCases} isHidden onChanged={refreshQuestion} />
          </div>

          <div className="card">
            <h2>11. Review / approval</h2>
            <p>
              Current status: <ApprovalBadge status={question.approvalStatus} />
            </p>
            {question.attachedToAssessments.length > 0 && (
              <p className="field-hint">
                Used by: {question.attachedToAssessments.map((a) => `${a.title} (${a.status})`).join(', ')}
              </p>
            )}
            <div className="action-row">
              <button onClick={() => void handleReview('APPROVED')} disabled={question.approvalStatus === 'APPROVED'}>
                Approve
              </button>
              <button className="btn-secondary" onClick={() => void handleReview('NEEDS_EDIT')}>
                Needs edit
              </button>
              <button className="btn-secondary" onClick={() => void handleReview('REJECTED')}>
                Reject
              </button>
              <button className="btn-secondary" onClick={() => void handleReview('PENDING_REVIEW')}>
                Send back to review
              </button>
              <button className="btn-danger" onClick={() => void handleDelete()}>
                Delete question
              </button>
            </div>

            {question.reviews.length > 0 && (
              <table className="table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Notes</th>
                    <th>Reviewer</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {question.reviews.map((r) => (
                    <tr key={r.id}>
                      <td>{r.status}</td>
                      <td>{r.notes ?? '—'}</td>
                      <td>{r.reviewedBy?.name ?? '—'}</td>
                      <td>{new Date(r.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TestCaseArrayEditor({ rows, onChange }: { rows: TestCaseRow[]; onChange: (rows: TestCaseRow[]) => void }) {
  return (
    <>
      {rows.map((tc, i) => (
        <div key={i} className="repeatable-item">
          <label>Input</label>
          <textarea rows={2} value={tc.input} onChange={(e) => onChange(rows.map((r, idx) => (idx === i ? { ...r, input: e.target.value } : r)))} />
          <label>Expected output</label>
          <textarea rows={2} value={tc.expectedOutput} onChange={(e) => onChange(rows.map((r, idx) => (idx === i ? { ...r, expectedOutput: e.target.value } : r)))} />
          {rows.length > 1 && (
            <button type="button" className="btn-secondary btn-small" onClick={() => onChange(rows.filter((_, idx) => idx !== i))}>
              Remove
            </button>
          )}
        </div>
      ))}
      <button type="button" className="btn-secondary btn-small" onClick={() => onChange([...rows, { input: '', expectedOutput: '' }])}>
        Add test case
      </button>
    </>
  );
}

function TestCaseLiveEditor({
  questionId,
  testCases,
  isHidden,
  onChanged,
}: {
  questionId: string;
  testCases: TestCaseItem[];
  isHidden: boolean;
  onChanged: () => Promise<void>;
}) {
  const [newInput, setNewInput] = useState('');
  const [newOutput, setNewOutput] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    setError(null);
    try {
      await addTestCase(questionId, { isHidden, input: newInput, expectedOutput: newOutput });
      setNewInput('');
      setNewOutput('');
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add test case');
    }
  }

  return (
    <div className="section-block">
      <h4>{isHidden ? 'Hidden test cases' : 'Public test cases'}</h4>
      {testCases.length === 0 ? (
        <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>None yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Input</th>
              <th>Expected output</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {testCases.map((tc) => (
              <tr key={tc.id}>
                <td>
                  <textarea
                    rows={1}
                    defaultValue={tc.input}
                    onBlur={(e) => {
                      if (e.target.value !== tc.input) void updateTestCase(questionId, tc.id, { input: e.target.value }).then(onChanged);
                    }}
                  />
                </td>
                <td>
                  <textarea
                    rows={1}
                    defaultValue={tc.expectedOutput}
                    onBlur={(e) => {
                      if (e.target.value !== tc.expectedOutput) void updateTestCase(questionId, tc.id, { expectedOutput: e.target.value }).then(onChanged);
                    }}
                  />
                </td>
                <td>
                  <button className="btn-secondary btn-small" onClick={() => void removeTestCase(questionId, tc.id).then(onChanged)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="action-row">
        <textarea rows={1} placeholder="New input" value={newInput} onChange={(e) => setNewInput(e.target.value)} style={{ flex: 1, marginBottom: 0 }} />
        <textarea rows={1} placeholder="New expected output" value={newOutput} onChange={(e) => setNewOutput(e.target.value)} style={{ flex: 1, marginBottom: 0 }} />
        <button type="button" className="btn-secondary btn-small" onClick={() => void handleAdd()} disabled={!newInput.trim() || !newOutput.trim()}>
          Add
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
