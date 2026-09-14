import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import '../lib/monaco-setup';
import { ArrowLeft, History, Play, RotateCcw, Send } from 'lucide-react';
import { getGenericStarterCode, type ProgrammingLanguageCode } from '@technical-platform/shared';
import { ApiError } from '../lib/api-client';
import { pollSubmission, type SubmissionDetailDto } from '../lib/attempts-api';
import {
  getNextRecommendedProblem,
  getPracticeQuestion,
  getPracticeSubmissionHistory,
  runPracticeCode,
  savePracticeDraft,
  submitPracticeCode,
  type PracticeQuestionDetail,
  type PracticeQuestionListItem,
} from '../lib/practice-api';
import { DifficultyBadge } from '../components/ApprovalBadge';
import { useConfirm } from '../components/useConfirm';
import { QUESTION_STATUS_LABELS, questionStatusPillClass } from '../lib/verdict';
import { ExecutionResultPanel } from './exam/ExecutionResultPanel';
import { PracticeCompletionPanel } from './practice/PracticeCompletionPanel';
import { PracticeSubmissionHistoryPanel } from './practice/PracticeSubmissionHistoryPanel';
import { SaveIndicator, type SaveState } from './exam/SaveIndicator';
import type { SubmissionHistoryItemDto } from '../lib/attempts-api';

const SAVE_DEBOUNCE_MS = 1500;

const MONACO_LANGUAGE_ID: Record<ProgrammingLanguageCode, string> = {
  CPP: 'cpp',
  JAVA: 'java',
  PYTHON: 'python',
};

export function PracticeWorkspacePage() {
  const { id: questionId } = useParams<{ id: string }>();
  const [question, setQuestion] = useState<PracticeQuestionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestConfirm, confirmDialog] = useConfirm();

  const [language, setLanguage] = useState<ProgrammingLanguageCode | null>(null);
  const [editedByLanguage, setEditedByLanguage] = useState<Partial<Record<ProgrammingLanguageCode, string>>>({});
  const [saveStateByLanguage, setSaveStateByLanguage] = useState<Partial<Record<ProgrammingLanguageCode, SaveState>>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editedRef = useRef<Partial<Record<ProgrammingLanguageCode, string>>>({});
  useEffect(() => {
    editedRef.current = editedByLanguage;
  }, [editedByLanguage]);

  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<SubmissionDetailDto | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const runAbortRef = useRef<AbortController | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmissionDetailDto | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitAbortRef = useRef<AbortController | null>(null);

  const [nextProblem, setNextProblem] = useState<PracticeQuestionListItem | null>(null);
  const [nextProblemLoading, setNextProblemLoading] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<SubmissionHistoryItemDto[]>([]);

  useEffect(() => {
    if (!questionId) return;
    let cancelled = false;
    // Reset every run/submit-derived UI state left over from whichever problem was open
    // before — otherwise navigating via "Next problem" (or browser back/forward between
    // two problem URLs, which React Router doesn't remount for) would show this new
    // problem's title inside the previous problem's stale completion banner and test
    // results, a confusing "wrong data" state rather than a clean load.
    setLoading(true);
    setError(null);
    setEditedByLanguage({});
    setSaveStateByLanguage({});
    setRunResult(null);
    setRunError(null);
    setSubmitResult(null);
    setSubmitError(null);
    setNextProblem(null);
    setNextProblemLoading(false);
    setHistoryOpen(false);
    setHistory([]);
    (async () => {
      try {
        const q = await getPracticeQuestion(questionId);
        if (cancelled) return;
        setQuestion(q);
        setLanguage((q.drafts[0]?.language ?? q.supportedLanguages[0]) as ProgrammingLanguageCode);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError && err.status === 404 ? 'Problem not found' : 'Failed to load this problem');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  // Flush a pending debounced save immediately on tab close.
  useEffect(() => {
    function flush() {
      if (!saveTimerRef.current || !questionId || !language) return;
      clearTimeout(saveTimerRef.current);
      const value = editedRef.current[language];
      if (value !== undefined) void savePracticeDraft(questionId, language, value);
    }
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [questionId, language]);

  const draftsByLanguage = useMemo(() => {
    const map = new Map<ProgrammingLanguageCode, string>();
    for (const d of question?.drafts ?? []) map.set(d.language, d.code);
    return map;
  }, [question]);

  const code = useMemo(() => {
    if (!question || !language) return '';
    if (editedByLanguage[language] !== undefined) return editedByLanguage[language]!;
    const draft = draftsByLanguage.get(language);
    if (draft !== undefined) return draft;
    return question.starterCode[language] ?? getGenericStarterCode(language);
  }, [question, language, editedByLanguage, draftsByLanguage]);

  const saveState: SaveState = language
    ? (saveStateByLanguage[language] ?? (draftsByLanguage.has(language) ? 'saved' : 'idle'))
    : 'idle';

  async function persist(lang: ProgrammingLanguageCode, value: string) {
    if (!questionId) return;
    setSaveStateByLanguage((prev) => ({ ...prev, [lang]: 'saving' }));
    try {
      await savePracticeDraft(questionId, lang, value);
      setSaveStateByLanguage((prev) => ({ ...prev, [lang]: 'saved' }));
    } catch {
      setSaveStateByLanguage((prev) => ({ ...prev, [lang]: 'error' }));
    }
  }

  function handleEditorChange(value: string | undefined) {
    if (!language) return;
    const next = value ?? '';
    setEditedByLanguage((prev) => ({ ...prev, [language]: next }));
    setSaveStateByLanguage((prev) => ({ ...prev, [language]: 'unsaved' }));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persist(language, next);
    }, SAVE_DEBOUNCE_MS);
  }

  function flushPending() {
    if (!saveTimerRef.current || !language) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const value = editedByLanguage[language];
    if (value !== undefined) void persist(language, value);
  }

  function changeLanguage(next: ProgrammingLanguageCode) {
    flushPending();
    setLanguage(next);
    setRunResult(null);
    setRunError(null);
    setSubmitResult(null);
    setSubmitError(null);
    setNextProblem(null);
  }

  async function handleReset() {
    if (!question || !language) return;
    const ok = await requestConfirm({
      title: 'Reset your code?',
      description: `This resets your ${language} code for "${question.title}" back to the starter template. This cannot be undone.`,
      confirmLabel: 'Reset code',
      confirmVariant: 'danger',
    });
    if (!ok) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const starter = question.starterCode[language] ?? getGenericStarterCode(language);
    setEditedByLanguage((prev) => ({ ...prev, [language]: starter }));
    void persist(language, starter);
  }

  async function loadHistory() {
    if (!questionId) return;
    setHistoryLoading(true);
    try {
      const result = await getPracticeSubmissionHistory(questionId, { pageSize: 20 });
      setHistory(result.data);
    } catch {
      // Best-effort — the panel just stays empty/stale.
    } finally {
      setHistoryLoading(false);
    }
  }

  function toggleHistory() {
    const nowOpen = !historyOpen;
    setHistoryOpen(nowOpen);
    if (nowOpen) void loadHistory();
  }

  async function refreshQuestionStatus() {
    if (!questionId) return;
    try {
      const q = await getPracticeQuestion(questionId);
      setQuestion(q);
    } catch {
      // Best-effort — the status pill just stays stale until the next successful load.
    }
  }

  async function handleRunCode() {
    if (!questionId || !language || running) return;
    runAbortRef.current?.abort();
    const controller = new AbortController();
    runAbortRef.current = controller;

    setRunning(true);
    setRunError(null);
    try {
      const { submissionId } = await runPracticeCode(questionId, language, code);
      const result = await pollSubmission(submissionId, { signal: controller.signal });
      setRunResult(result);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setRunError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to run code');
    } finally {
      setRunning(false);
    }
  }

  async function handleSubmitSolution() {
    if (!questionId || !language || submitting || !question) return;
    const ok = await requestConfirm({
      title: 'Submit this solution?',
      description: `"${question.title}" will be judged against all test cases (including hidden ones) and recorded in your submission history.`,
      confirmLabel: 'Submit solution',
      confirmVariant: 'success',
    });
    if (!ok) return;

    submitAbortRef.current?.abort();
    const controller = new AbortController();
    submitAbortRef.current = controller;

    setSubmitting(true);
    setSubmitError(null);
    setNextProblem(null);
    try {
      const { submissionId } = await submitPracticeCode(questionId, language, code);
      const result = await pollSubmission(submissionId, { signal: controller.signal });
      setSubmitResult(result);
      void loadHistory();
      void refreshQuestionStatus();
      if (result.status === 'ACCEPTED') {
        setNextProblemLoading(true);
        getNextRecommendedProblem(questionId, question.topics[0])
          .then(setNextProblem)
          .catch(() => setNextProblem(null))
          .finally(() => setNextProblemLoading(false));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setSubmitError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to submit solution');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="page-centered">Loading problem…</div>;
  if (error || !question) return <div className="page-centered form-error">{error ?? 'Problem not found'}</div>;

  return (
    <div className="exam-shell">
      {confirmDialog}
      <div className="exam-topbar">
        <div className="exam-topbar-brand">
          <Link to="/student/practice/problems" className="back-link" style={{ margin: 0 }}>
            <ArrowLeft size={14} /> Problems
          </Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className={`exam-status-pill ${questionStatusPillClass(question.status)}`}>
            {QUESTION_STATUS_LABELS[question.status]}
          </span>
        </div>
      </div>

      {submitError && (
        <p className="form-error" style={{ margin: '0.5rem 1.5rem 0' }}>
          {submitError}
        </p>
      )}

      <div className="exam-body">
        <main className="exam-main">
          <div className="exam-problem-panel">
            <div className="page-header">
              <h2 style={{ margin: 0 }}>{question.title}</h2>
              <DifficultyBadge difficulty={question.difficulty} />
            </div>
            <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>
              Time limit: {question.timeLimitSeconds}s · Memory limit: {question.memoryLimitMb}MB
            </p>
            {question.topics.length > 0 && (
              <p>
                {question.topics.map((t) => (
                  <span key={t} className="topic-tag">
                    {t}
                  </span>
                ))}
              </p>
            )}

            <h3>Problem statement</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{question.problemStatement}</p>

            <h3>Input format</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{question.inputFormat}</p>

            <h3>Output format</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{question.outputFormat}</p>

            {question.constraints.length > 0 && (
              <>
                <h3>Constraints</h3>
                <ul>
                  {question.constraints.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </>
            )}

            <h3>Examples</h3>
            {question.examples.map((ex, i) => (
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

            <h3>Public test cases</h3>
            {question.publicTestCases.map((tc) => (
              <div key={tc.id} className="example-block">
                <strong>Input</strong>
                <pre>{tc.input}</pre>
                <strong>Expected output</strong>
                <pre>{tc.expectedOutput}</pre>
              </div>
            ))}
          </div>

          {language && (
            <div className="exam-coding-panel">
              <div className="exam-coding-toolbar">
                <select value={language} onChange={(e) => changeLanguage(e.target.value as ProgrammingLanguageCode)} style={{ marginBottom: 0 }}>
                  {question.supportedLanguages.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <SaveIndicator state={saveState} />
                  <button type="button" className="btn-secondary btn-small btn-icon" onClick={toggleHistory}>
                    <History size={13} /> {historyOpen ? 'Hide history' : 'Submission history'}
                  </button>
                  <button type="button" className="btn-small btn-icon" onClick={() => void handleRunCode()} disabled={running}>
                    <Play size={13} /> {running ? 'Running…' : 'Run Code'}
                  </button>
                  <button
                    type="button"
                    className="btn-submit btn-small btn-icon"
                    onClick={() => void handleSubmitSolution()}
                    disabled={submitting}
                  >
                    <Send size={13} /> {submitting ? 'Judging…' : 'Submit Solution'}
                  </button>
                  <button type="button" className="btn-secondary btn-small btn-icon" onClick={() => void handleReset()}>
                    <RotateCcw size={13} /> Reset code
                  </button>
                </div>
              </div>
              <div className="exam-editor-wrap">
                <Editor
                  key={language}
                  height="100%"
                  language={MONACO_LANGUAGE_ID[language]}
                  value={code}
                  onChange={handleEditorChange}
                  theme="vs"
                  options={{
                    automaticLayout: true,
                    fontSize: 14,
                    minimap: { enabled: false },
                    lineNumbers: 'on',
                    folding: true,
                    matchBrackets: 'always',
                    tabSize: 4,
                    insertSpaces: true,
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    renderWhitespace: 'selection',
                  }}
                />
              </div>
              {historyOpen && <PracticeSubmissionHistoryPanel items={history} loading={historyLoading} />}
              {submitResult && !submitting && submitResult.status === 'ACCEPTED' && (
                <PracticeCompletionPanel
                  title={question.title}
                  difficulty={question.difficulty}
                  result={submitResult}
                  nextProblem={nextProblem}
                  nextProblemLoading={nextProblemLoading}
                  onViewHistory={() => {
                    if (!historyOpen) toggleHistory();
                  }}
                />
              )}
              {submitResult && !submitting && <ExecutionResultPanel title="Submission Result" result={submitResult} />}
              {runError && <div className="exam-run-status error">{runError}</div>}
              {runResult && !running ? (
                <ExecutionResultPanel title="Run Result" result={runResult} />
              ) : (
                !submitResult && (
                  <div className="exam-no-execution-note">
                    Run Code checks your solution against this problem's public test cases only. Submit Solution grades it
                    against every test case, including hidden ones.
                  </div>
                )
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
