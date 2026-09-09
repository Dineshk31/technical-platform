import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Sparkles } from 'lucide-react';
import { CODING_TOPICS, DIFFICULTY_LEVELS, PROGRAMMING_LANGUAGES, type AIGeneratedCodingQuestion } from '@technical-platform/shared';
import { ApiError } from '../lib/api-client';
import { generateQuestions, saveGeneratedQuestions, type GenerationPreview } from '../lib/ai-api';
import { ApprovalBadge, DifficultyBadge } from '../components/ApprovalBadge';

interface DraftRow extends AIGeneratedCodingQuestion {
  selected: boolean;
}

export function AdminAIGeneratorPage() {
  const [topic, setTopic] = useState<string>(CODING_TOPICS[0]);
  const [difficulty, setDifficulty] = useState<string>('MEDIUM');
  const [language, setLanguage] = useState<string>('PYTHON');
  const [count, setCount] = useState(3);
  const [concepts, setConcepts] = useState('');
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [marks, setMarks] = useState('');
  const [timeLimitSeconds, setTimeLimitSeconds] = useState('');
  const [memoryLimitMb, setMemoryLimitMb] = useState('');

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GenerationPreview | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[] | null>(null);

  function buildRequest() {
    const parsedConcepts = concepts
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    return {
      topic: topic as (typeof CODING_TOPICS)[number],
      difficulty: difficulty as (typeof DIFFICULTY_LEVELS)[number],
      language: language as (typeof PROGRAMMING_LANGUAGES)[number],
      count,
      concepts: parsedConcepts.length ? parsedConcepts : undefined,
      additionalInstructions: additionalInstructions.trim() || undefined,
      marks: marks ? Number(marks) : undefined,
      timeLimitSeconds: timeLimitSeconds ? Number(timeLimitSeconds) : undefined,
      memoryLimitMb: memoryLimitMb ? Number(memoryLimitMb) : undefined,
    };
  }

  async function handleGenerate(e?: FormEvent) {
    e?.preventDefault();
    if (generating) return; // guards against a double-click firing two requests
    setGenerating(true);
    setGenerateError(null);
    setSaveError(null);
    setSavedIds(null);
    try {
      const result = await generateQuestions(buildRequest());
      setPreview(result);
      setDrafts(result.generated.map((q) => ({ ...q, selected: true })));
    } catch (err) {
      setGenerateError(err instanceof ApiError ? err.message : 'Failed to generate questions');
      setPreview(null);
      setDrafts([]);
    } finally {
      setGenerating(false);
    }
  }

  function updateDraft(index: number, patch: Partial<DraftRow>) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function discardDraft(index: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!preview) return;
    const selected = drafts.filter((d) => d.selected);
    if (selected.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      // solutionApproach is preview-only (no column in coding_questions) — dropped before save.
      const payload = selected.map(({ selected: _selected, solutionApproach: _solutionApproach, ...rest }) => rest);
      const result = await saveGeneratedQuestions(preview.requestId, payload);
      setSavedIds(result.created);
      setDrafts((prev) => prev.filter((d) => !d.selected));
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save questions');
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = drafts.filter((d) => d.selected).length;

  return (
    <div className="dashboard-body">
      <Link to="/admin/questions" className="back-link">
        <ArrowLeft size={14} /> Back to Question Bank
      </Link>
      <div className="page-header">
        <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Sparkles size={20} style={{ color: 'var(--color-secondary)' }} /> AI Question Generator
        </h1>
      </div>
      <p className="field-hint" style={{ marginTop: 0 }}>
        Generated questions are a <strong>preview only</strong> — nothing is added to the question bank, and nothing is
        visible to students, until you explicitly select and save them below. Saved questions still start as{' '}
        <code>PENDING_REVIEW</code>, exactly like a manually created question.
      </p>

      <div className="card">
        <form onSubmit={handleGenerate} className="form-grid">
          <div>
            <label>Topic</label>
            <select value={topic} onChange={(e) => setTopic(e.target.value)} disabled={generating}>
              {CODING_TOPICS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Difficulty</label>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} disabled={generating}>
              {DIFFICULTY_LEVELS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Language</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={generating}>
              {PROGRAMMING_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Number of questions (max 10)</label>
            <input
              type="number"
              min={1}
              max={10}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              disabled={generating}
              required
            />
          </div>

          <div className="field-full">
            <label>Concepts to specifically test (comma-separated, optional)</label>
            <input
              value={concepts}
              onChange={(e) => setConcepts(e.target.value)}
              placeholder="e.g. two pointers, prefix sums"
              disabled={generating}
              style={{ width: '100%' }}
            />
          </div>
          <div className="field-full">
            <label>Additional instructions (optional)</label>
            <textarea
              rows={2}
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              disabled={generating}
              placeholder="e.g. avoid graph questions, focus on edge cases with negative numbers"
            />
          </div>

          <div className="field-full">
            <button type="button" className="btn-secondary btn-small" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? 'Hide' : 'Show'} advanced options
            </button>
          </div>
          {showAdvanced && (
            <>
              <div>
                <label>Marks (optional, default 10)</label>
                <input type="number" min={1} max={1000} value={marks} onChange={(e) => setMarks(e.target.value)} disabled={generating} />
              </div>
              <div>
                <label>Time limit seconds (optional, default 2)</label>
                <input
                  type="number"
                  step="0.5"
                  min={0.5}
                  max={10}
                  value={timeLimitSeconds}
                  onChange={(e) => setTimeLimitSeconds(e.target.value)}
                  disabled={generating}
                />
              </div>
              <div>
                <label>Memory limit MB (optional, default 256)</label>
                <input
                  type="number"
                  min={16}
                  max={1024}
                  value={memoryLimitMb}
                  onChange={(e) => setMemoryLimitMb(e.target.value)}
                  disabled={generating}
                />
              </div>
            </>
          )}

          {generateError && <p className="form-error field-full">{generateError}</p>}

          <div className="field-full action-row">
            <button type="submit" disabled={generating} className="btn-icon">
              {generating ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles size={15} /> Generate
                </>
              )}
            </button>
            {generateError && (
              <button type="button" className="btn-secondary" onClick={() => void handleGenerate()} disabled={generating}>
                Retry
              </button>
            )}
            {preview && !generating && (
              <button type="button" className="btn-secondary" onClick={() => void handleGenerate()}>
                Regenerate (new batch)
              </button>
            )}
          </div>
        </form>
      </div>

      {savedIds && savedIds.length > 0 && (
        <div className="card">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={18} style={{ color: 'var(--color-success)' }} /> Saved {savedIds.length} question(s)
          </h2>
          <p className="field-hint">
            They are in the question bank as <code>PENDING_REVIEW</code>. Open each to review, edit, and approve it
            before it can be attached to an assessment.
          </p>
          <ul>
            {savedIds.map((id) => (
              <li key={id}>
                <Link to={`/admin/questions/${id}/edit`}>Review question {id.slice(0, 8)}…</Link>
              </li>
            ))}
          </ul>
          <Link to="/admin/questions?source=AI_GENERATED&approvalStatus=PENDING_REVIEW">
            <button className="btn-secondary btn-small">Go to AI Review Queue</button>
          </Link>
        </div>
      )}

      {preview && preview.failed.length > 0 && (
        <div className="card">
          <h2>{preview.failed.length} candidate(s) failed validation</h2>
          <p className="field-hint">
            These were never saved anywhere — Gemini's output didn't meet the platform's question schema. You can
            regenerate to try again.
          </p>
          {preview.failed.map((f) => (
            <div key={f.index} className="section-block">
              <h4>Candidate #{f.index + 1}</h4>
              <ul>
                {f.issues.map((issue, i) => (
                  <li key={i} style={{ color: 'var(--color-danger, #b91c1c)' }}>
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {drafts.length > 0 && (
        <div className="card">
          <div className="page-header">
            <h2 style={{ margin: 0 }}>
              Review {drafts.length} generated question{drafts.length === 1 ? '' : 's'}
            </h2>
            <button onClick={() => void handleSave()} disabled={saving || selectedCount === 0}>
              {saving ? 'Saving…' : `Save ${selectedCount} selected`}
            </button>
          </div>
          {saveError && <p className="form-error">{saveError}</p>}

          {drafts.map((draft, i) => (
            <DraftCard key={i} draft={draft} onChange={(patch) => updateDraft(i, patch)} onDiscard={() => discardDraft(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DraftCard({
  draft,
  onChange,
  onDiscard,
}: {
  draft: DraftRow;
  onChange: (patch: Partial<DraftRow>) => void;
  onDiscard: () => void;
}) {
  return (
    <div className="section-block" style={{ opacity: draft.selected ? 1 : 0.6 }}>
      <div className="action-row" style={{ justifyContent: 'space-between' }}>
        <label className="checkbox-row" style={{ marginBottom: 0 }}>
          <input type="checkbox" checked={draft.selected} onChange={(e) => onChange({ selected: e.target.checked })} />
          <strong>Save this question</strong>
        </label>
        <button type="button" className="btn-danger btn-small" onClick={onDiscard}>
          Discard
        </button>
      </div>

      <div className="form-grid" style={{ marginTop: '0.75rem' }}>
        <div className="field-full">
          <label>Title</label>
          <input value={draft.title} onChange={(e) => onChange({ title: e.target.value })} style={{ width: '100%' }} />
        </div>
        <div>
          <label>Difficulty</label>
          <select value={draft.difficulty} onChange={(e) => onChange({ difficulty: e.target.value as DraftRow['difficulty'] })}>
            {DIFFICULTY_LEVELS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Marks</label>
          <input type="number" min={1} max={1000} value={draft.marks} onChange={(e) => onChange({ marks: Number(e.target.value) })} />
        </div>
        <div>
          <DifficultyBadge difficulty={draft.difficulty} />
          <span style={{ marginLeft: '0.5rem' }}>
            <ApprovalBadge status="PENDING_REVIEW" />
          </span>
        </div>
      </div>

      <p style={{ whiteSpace: 'pre-wrap' }}>{draft.problemStatement}</p>

      <div className="form-grid">
        {draft.topics.map((t) => (
          <span key={t} className="topic-tag">
            {t}
          </span>
        ))}
      </div>

      {draft.constraints.length > 0 && (
        <>
          <h4>Constraints</h4>
          <ul>
            {draft.constraints.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </>
      )}

      <h4>Examples</h4>
      {draft.examples.map((ex, i) => (
        <div key={i} className="example-block">
          <strong>Input</strong>
          <pre>{ex.input}</pre>
          <strong>Output</strong>
          <pre>{ex.output}</pre>
          {ex.explanation && (
            <>
              <strong>Explanation</strong>
              <p style={{ margin: '0.25rem 0 0' }}>{ex.explanation}</p>
            </>
          )}
        </div>
      ))}

      <h4>Public test cases ({draft.publicTestCases.length})</h4>
      {draft.publicTestCases.map((tc, i) => (
        <div key={i} className="example-block">
          <strong>Input</strong>
          <pre>{tc.input}</pre>
          <strong>Expected output</strong>
          <pre>{tc.expectedOutput}</pre>
        </div>
      ))}

      <h4>Hidden test cases ({draft.hiddenTestCases.length})</h4>
      <p className="field-hint">Never shown to students — listed here for admin review only.</p>
      {draft.hiddenTestCases.map((tc, i) => (
        <div key={i} className="example-block">
          <strong>Input</strong>
          <pre>{tc.input}</pre>
          <strong>Expected output</strong>
          <pre>{tc.expectedOutput}</pre>
        </div>
      ))}

      <h4>Reference solution(s)</h4>
      {Object.entries(draft.referenceSolutions).map(([lang, code]) => (
        <div key={lang}>
          <label>{lang}</label>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{code}</pre>
        </div>
      ))}

      {draft.solutionApproach && (
        <>
          <h4>Solution approach (admin-only note)</h4>
          <p className="field-hint">{draft.solutionApproach}</p>
        </>
      )}
    </div>
  );
}
