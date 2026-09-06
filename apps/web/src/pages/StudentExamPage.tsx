import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import '../lib/monaco-setup';
import { getGenericStarterCode, type ProgrammingLanguageCode } from '@technical-platform/shared';
import { ApiError } from '../lib/api-client';
import {
  getAttemptDetail,
  getAttemptDrafts,
  getAttemptStatus,
  getStudentQuestions,
  pollSubmission,
  runCode,
  saveAttemptDraft,
  submitAttempt,
  type AttemptStatusDto,
  type CodeDraftDto,
  type StudentQuestionDto,
  type StudentQuestionsResponse,
  type SubmissionDetailDto,
  type SubmissionStatus,
} from '../lib/attempts-api';
import { DifficultyBadge } from '../components/ApprovalBadge';

const STATUS_POLL_MS = 15_000;
const SAVE_DEBOUNCE_MS = 1500;

const MONACO_LANGUAGE_ID: Record<ProgrammingLanguageCode, string> = {
  CPP: 'cpp',
  JAVA: 'java',
  PYTHON: 'python',
};

type SaveState = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

const RUN_STATUS_LABELS: Record<SubmissionStatus, string> = {
  PENDING: 'Queued…',
  RUNNING: 'Running…',
  ACCEPTED: 'Accepted — all public tests passed',
  WRONG_ANSWER: 'Wrong Answer',
  COMPILATION_ERROR: 'Compilation Error',
  RUNTIME_ERROR: 'Runtime Error',
  TIME_LIMIT_EXCEEDED: 'Time Limit Exceeded',
  MEMORY_LIMIT_EXCEEDED: 'Memory Limit Exceeded',
  INTERNAL_ERROR: 'Execution failed — please try again',
};

function statusPillClass(status: SubmissionStatus): string {
  if (status === 'ACCEPTED') return 'pass';
  if (status === 'PENDING' || status === 'RUNNING') return 'pending';
  return 'fail';
}

function draftKey(questionId: string, language: string): string {
  return `${questionId}::${language}`;
}

function resolveStarterCode(question: StudentQuestionDto, language: ProgrammingLanguageCode): string {
  return question.starterCode[language] ?? getGenericStarterCode(language);
}

/**
 * "Visited" is a purely client-side navigation convenience (see docs — Phase 4
 * explicitly asks for draft/progress state to stay separated from real
 * submission state). It is never sent to the server and never confused with
 * the server-computed NOT_ATTEMPTED/ATTEMPTED/SOLVED status shown alongside it.
 */
function visitedStorageKey(attemptId: string) {
  return `exam-visited-${attemptId}`;
}

function loadVisited(attemptId: string): Set<string> {
  try {
    const raw = localStorage.getItem(visitedStorageKey(attemptId));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveVisited(attemptId: string, ids: Set<string>) {
  try {
    localStorage.setItem(visitedStorageKey(attemptId), JSON.stringify([...ids]));
  } catch {
    // best-effort convenience only
  }
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function StudentExamPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [assessmentTitle, setAssessmentTitle] = useState('');
  const [status, setStatus] = useState<AttemptStatusDto | null>(null);
  const [questionsData, setQuestionsData] = useState<StudentQuestionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ---- Phase 5: code draft state ----
  const [draftsByKey, setDraftsByKey] = useState<Map<string, CodeDraftDto>>(new Map());
  const [editedByKey, setEditedByKey] = useState<Record<string, string>>({});
  const [saveStateByKey, setSaveStateByKey] = useState<Record<string, SaveState>>({});
  const [languageByQuestion, setLanguageByQuestion] = useState<Record<string, ProgrammingLanguageCode>>({});
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const editedByKeyRef = useRef<Record<string, string>>({});
  useEffect(() => {
    editedByKeyRef.current = editedByKey;
  }, [editedByKey]);

  // ---- Phase 6: Run Code state (keyed by questionId::language, same as drafts) ----
  const [runningByKey, setRunningByKey] = useState<Record<string, boolean>>({});
  const [runResultByKey, setRunResultByKey] = useState<Record<string, SubmissionDetailDto>>({});
  const [runErrorByKey, setRunErrorByKey] = useState<Record<string, string>>({});
  const runAbortRef = useRef<Record<string, AbortController>>({});

  const clockOffsetRef = useRef(0); // serverNow - localNow, applied so a skewed client clock can't matter

  const refreshStatus = useCallback(async (aid: string) => {
    const s = await getAttemptStatus(aid);
    clockOffsetRef.current = new Date(s.serverNow).getTime() - Date.now();
    setStatus(s);
    return s;
  }, []);

  // Resolve attemptId -> assessmentId, then load status + questions + saved drafts.
  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;
    (async () => {
      try {
        const detail = await getAttemptDetail(attemptId);
        if (cancelled) return;
        setAssessmentId(detail.assessmentId);
        setAssessmentTitle(detail.assessmentTitle);
        setVisited(loadVisited(attemptId));

        const [, questions, drafts] = await Promise.all([
          refreshStatus(detail.assessmentId),
          getStudentQuestions(detail.assessmentId),
          getAttemptDrafts(attemptId),
        ]);
        if (cancelled) return;
        setQuestionsData(questions);
        setDraftsByKey(new Map(drafts.map((d) => [draftKey(d.questionId, d.language), d])));

        const firstQuestion = questions.sections[0]?.questions[0];
        if (firstQuestion) setCurrentQuestionId(firstQuestion.id);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? `${err.status}: ${err.message}` : 'Failed to load the assessment');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId, refreshStatus]);

  // Periodic re-sync with the server — catches expiry/AUTO_SUBMITTED even if this tab is idle.
  useEffect(() => {
    if (!assessmentId) return;
    const interval = setInterval(() => {
      void refreshStatus(assessmentId).catch(() => {});
    }, STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [assessmentId, refreshStatus]);

  // Local 1s countdown ticker, corrected by the server clock offset — never the sole source of truth.
  useEffect(() => {
    if (!status) return;
    const endsAtMs = new Date(status.endsAt).getTime();
    const tick = () => {
      const correctedNow = Date.now() + clockOffsetRef.current;
      const remaining = endsAtMs - correctedNow;
      setRemainingMs(remaining);
      if (remaining <= 0 && status.status === 'IN_PROGRESS' && assessmentId) {
        // Ask the server to confirm/apply expiry rather than trusting the local countdown.
        void refreshStatus(assessmentId).catch(() => {});
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [status, assessmentId, refreshStatus]);

  // Flush every pending debounced save immediately when the tab is closed/hidden —
  // otherwise the last <1.5s of edits could be lost on an abrupt close.
  useEffect(() => {
    function flushAllPending() {
      for (const key of Object.keys(saveTimersRef.current)) {
        clearTimeout(saveTimersRef.current[key]);
        delete saveTimersRef.current[key];
        const [questionId, language] = key.split('::');
        const value = editedByKeyRef.current[key];
        if (attemptId && questionId && language && value !== undefined) {
          // Fire-and-forget: the page may be closing, there's no time to await.
          void saveAttemptDraft(attemptId, questionId, language as ProgrammingLanguageCode, value);
        }
      }
    }
    window.addEventListener('beforeunload', flushAllPending);
    return () => window.removeEventListener('beforeunload', flushAllPending);
  }, [attemptId]);

  const flatQuestions = useMemo<StudentQuestionDto[]>(
    () => questionsData?.sections.flatMap((s) => s.questions) ?? [],
    [questionsData],
  );
  const currentIndex = flatQuestions.findIndex((q) => q.id === currentQuestionId);
  const currentQuestion = currentIndex >= 0 ? flatQuestions[currentIndex] : null;
  const currentLanguage: ProgrammingLanguageCode | null = currentQuestion
    ? (languageByQuestion[currentQuestion.questionId] ?? (currentQuestion.supportedLanguages[0] as ProgrammingLanguageCode))
    : null;
  const currentKey = currentQuestion && currentLanguage ? draftKey(currentQuestion.questionId, currentLanguage) : null;

  const currentCode = useMemo(() => {
    if (!currentQuestion || !currentLanguage || !currentKey) return '';
    if (editedByKey[currentKey] !== undefined) return editedByKey[currentKey];
    const draft = draftsByKey.get(currentKey);
    if (draft) return draft.code;
    return resolveStarterCode(currentQuestion, currentLanguage);
  }, [currentQuestion, currentLanguage, currentKey, editedByKey, draftsByKey]);

  const currentSaveState: SaveState = currentKey
    ? (saveStateByKey[currentKey] ?? (draftsByKey.has(currentKey) ? 'saved' : 'idle'))
    : 'idle';
  const currentRunning = currentKey ? (runningByKey[currentKey] ?? false) : false;
  const currentRunResult = currentKey ? runResultByKey[currentKey] : undefined;
  const currentRunError = currentKey ? runErrorByKey[currentKey] : undefined;

  function flushPending(key: string) {
    const timer = saveTimersRef.current[key];
    if (!timer) return;
    clearTimeout(timer);
    delete saveTimersRef.current[key];
    const [questionId, language] = key.split('::');
    const value = editedByKey[key];
    if (attemptId && value !== undefined) {
      void persist(key, questionId, language as ProgrammingLanguageCode, value);
    }
  }

  async function persist(key: string, questionId: string, language: ProgrammingLanguageCode, code: string) {
    if (!attemptId) return;
    setSaveStateByKey((prev) => ({ ...prev, [key]: 'saving' }));
    try {
      const result = await saveAttemptDraft(attemptId, questionId, language, code);
      setSaveStateByKey((prev) => ({ ...prev, [key]: 'saved' }));
      setDraftsByKey((prev) => {
        const next = new Map(prev);
        next.set(key, { questionId, language, code, updatedAt: result.updatedAt });
        return next;
      });
    } catch {
      setSaveStateByKey((prev) => ({ ...prev, [key]: 'error' }));
    }
  }

  function handleEditorChange(value: string | undefined) {
    if (!currentKey || !currentQuestion || !currentLanguage) return;
    const code = value ?? '';
    setEditedByKey((prev) => ({ ...prev, [currentKey]: code }));
    setSaveStateByKey((prev) => ({ ...prev, [currentKey]: 'unsaved' }));
    clearTimeout(saveTimersRef.current[currentKey]);
    saveTimersRef.current[currentKey] = setTimeout(() => {
      delete saveTimersRef.current[currentKey];
      void persist(currentKey, currentQuestion.questionId, currentLanguage, code);
    }, SAVE_DEBOUNCE_MS);
  }

  function selectQuestion(id: string) {
    if (currentKey) flushPending(currentKey);
    setCurrentQuestionId(id);
    if (attemptId && !visited.has(id)) {
      const next = new Set(visited).add(id);
      setVisited(next);
      saveVisited(attemptId, next);
    }
  }

  function changeLanguage(language: ProgrammingLanguageCode) {
    if (!currentQuestion) return;
    if (currentKey) flushPending(currentKey);
    setLanguageByQuestion((prev) => ({ ...prev, [currentQuestion.questionId]: language }));
  }

  function handleReset() {
    if (!currentQuestion || !currentLanguage || !currentKey) return;
    if (
      !window.confirm(
        `Reset your ${currentLanguage} code for "${currentQuestion.title}" to the starter template? This cannot be undone.`,
      )
    ) {
      return;
    }
    clearTimeout(saveTimersRef.current[currentKey]);
    delete saveTimersRef.current[currentKey];
    const starter = resolveStarterCode(currentQuestion, currentLanguage);
    setEditedByKey((prev) => ({ ...prev, [currentKey]: starter }));
    void persist(currentKey, currentQuestion.questionId, currentLanguage, starter);
  }

  async function handleRunCode() {
    if (!attemptId || !currentQuestion || !currentLanguage || !currentKey) return;
    if (runningByKey[currentKey]) return; // one in-flight run per question/language slot

    // Cancel any still-polling previous run for this exact slot (rapid double-click
    // guard beyond the disabled-button state, and avoids a stale poll overwriting a
    // newer result if the user runs again before the first poll finishes).
    runAbortRef.current[currentKey]?.abort();
    const controller = new AbortController();
    runAbortRef.current[currentKey] = controller;

    setRunningByKey((prev) => ({ ...prev, [currentKey]: true }));
    setRunErrorByKey((prev) => {
      const next = { ...prev };
      delete next[currentKey];
      return next;
    });

    try {
      const { submissionId } = await runCode(attemptId, currentQuestion.questionId, currentLanguage, currentCode);
      const result = await pollSubmission(submissionId, { signal: controller.signal });
      setRunResultByKey((prev) => ({ ...prev, [currentKey]: result }));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to run code';
      setRunErrorByKey((prev) => ({ ...prev, [currentKey]: message }));
    } finally {
      setRunningByKey((prev) => ({ ...prev, [currentKey]: false }));
    }
  }

  // Mark the initial question visited once questions load.
  useEffect(() => {
    if (currentQuestionId && attemptId && !visited.has(currentQuestionId)) {
      const next = new Set(visited).add(currentQuestionId);
      setVisited(next);
      saveVisited(attemptId, next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestionId]);

  async function handleSubmit() {
    if (!assessmentId) return;
    if (currentKey) flushPending(currentKey);
    if (!window.confirm('Submit and finish this assessment now? You will not be able to make further changes.')) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitAttempt(assessmentId);
      await refreshStatus(assessmentId);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="dashboard-body">Loading exam…</div>;
  if (error) return <div className="dashboard-body form-error">{error}</div>;
  if (!status || !questionsData) return null;

  const isActive = status.status === 'IN_PROGRESS';
  const low = remainingMs !== null && remainingMs < 5 * 60_000;

  return (
    <div className="exam-shell">
      <div className="exam-topbar">
        <div>
          <strong>{assessmentTitle}</strong>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
            Question {currentIndex + 1} of {flatQuestions.length}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span className={`exam-timer ${low ? 'low' : ''}`}>
            {isActive && remainingMs !== null ? formatDuration(remainingMs) : status.status.replace('_', ' ')}
          </span>
          {isActive ? (
            <button onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit assessment'}
            </button>
          ) : (
            <Link to="/student">
              <button className="btn-secondary">Back to dashboard</button>
            </Link>
          )}
        </div>
      </div>

      {!isActive && (
        <div className="locked-banner" style={{ margin: '0.75rem 1.5rem 0' }}>
          This attempt is {status.status.replace('_', ' ').toLowerCase()} — you can still review the questions and your
          saved code below, but no further changes can be made.
        </div>
      )}
      {submitError && (
        <p className="form-error" style={{ margin: '0.5rem 1.5rem 0' }}>
          {submitError}
        </p>
      )}

      <div className="exam-body">
        <nav className="exam-nav">
          {questionsData.sections.map((section) => (
            <div key={section.id} style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', margin: '0 0 0.4rem' }}>
                {section.title.toUpperCase()}
              </div>
              {section.questions.map((q, i) => {
                const dotClass =
                  q.status === 'SOLVED' ? 'solved' : q.status === 'ATTEMPTED' ? 'attempted' : visited.has(q.id) ? 'visited' : '';
                return (
                  <button
                    key={q.id}
                    type="button"
                    className={`exam-nav-item ${q.id === currentQuestionId ? 'current' : ''}`}
                    onClick={() => selectQuestion(q.id)}
                  >
                    <span className={`exam-nav-dot ${dotClass}`} />
                    Q{i + 1}. {q.title} ({q.marks})
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {currentQuestion && currentLanguage ? (
          <main className="exam-main">
            <div className="exam-problem-panel">
              <div className="page-header">
                <h2 style={{ margin: 0 }}>{currentQuestion.title}</h2>
                <DifficultyBadge difficulty={currentQuestion.difficulty} />
              </div>
              <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>
                Marks: {currentQuestion.marks} · Time limit: {currentQuestion.timeLimitSeconds}s · Memory limit:{' '}
                {currentQuestion.memoryLimitMb}MB
              </p>

              <h3>Problem statement</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{currentQuestion.problemStatement}</p>

              <h3>Input format</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{currentQuestion.inputFormat}</p>

              <h3>Output format</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{currentQuestion.outputFormat}</p>

              {currentQuestion.constraints.length > 0 && (
                <>
                  <h3>Constraints</h3>
                  <ul>
                    {currentQuestion.constraints.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </>
              )}

              <h3>Examples</h3>
              {currentQuestion.examples.map((ex, i) => (
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
              {currentQuestion.publicTestCases.map((tc) => (
                <div key={tc.id} className="example-block">
                  <strong>Input</strong>
                  <pre>{tc.input}</pre>
                  <strong>Expected output</strong>
                  <pre>{tc.expectedOutput}</pre>
                </div>
              ))}

              <div className="action-row" style={{ marginTop: '1rem' }}>
                <button
                  className="btn-secondary"
                  disabled={currentIndex <= 0}
                  onClick={() => selectQuestion(flatQuestions[currentIndex - 1].id)}
                >
                  ← Previous
                </button>
                <button
                  className="btn-secondary"
                  disabled={currentIndex >= flatQuestions.length - 1}
                  onClick={() => selectQuestion(flatQuestions[currentIndex + 1].id)}
                >
                  Next →
                </button>
              </div>
            </div>

            <div className="exam-coding-panel">
              <div className="exam-coding-toolbar">
                <select
                  value={currentLanguage}
                  onChange={(e) => changeLanguage(e.target.value as ProgrammingLanguageCode)}
                  style={{ marginBottom: 0 }}
                >
                  {currentQuestion.supportedLanguages.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <SaveIndicator state={currentSaveState} />
                  {isActive && (
                    <>
                      <button type="button" className="btn-small" onClick={() => void handleRunCode()} disabled={currentRunning}>
                        {currentRunning ? 'Running…' : 'Run Code'}
                      </button>
                      <button type="button" className="btn-secondary btn-small" onClick={handleReset}>
                        Reset code
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="exam-editor-wrap">
                <Editor
                  key={currentKey}
                  height="100%"
                  language={MONACO_LANGUAGE_ID[currentLanguage]}
                  value={currentCode}
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
                    readOnly: !isActive,
                    renderWhitespace: 'selection',
                  }}
                />
              </div>
              {currentRunError && <div className="exam-run-status error">{currentRunError}</div>}
              {currentRunResult && !currentRunning ? (
                <RunResultsPanel result={currentRunResult} />
              ) : (
                <div className="exam-no-execution-note">
                  Run Code checks your solution against this question's public test cases only. Grading against hidden
                  test cases happens when you submit the assessment.
                </div>
              )}
            </div>
          </main>
        ) : (
          <main className="exam-main">
            <div className="exam-problem-panel">
              <p>No questions in this assessment yet.</p>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}

function RunResultsPanel({ result }: { result: SubmissionDetailDto }) {
  const compileFailed = result.status === 'COMPILATION_ERROR';
  return (
    <div className="exam-run-results">
      <div className="exam-run-summary">
        <span className={`exam-status-pill ${statusPillClass(result.status)}`}>{RUN_STATUS_LABELS[result.status]}</span>
        {!compileFailed && (
          <span style={{ color: 'var(--color-muted)' }}>
            {result.testsPassed} / {result.testsTotal} public tests passed
          </span>
        )}
        {result.runtimeMs !== null && <span style={{ color: 'var(--color-muted)' }}>{result.runtimeMs} ms</span>}
      </div>

      {compileFailed && result.errorMessage && (
        <div className="exam-error-block">
          <h4>Compilation Error</h4>
          <pre>{result.errorMessage}</pre>
        </div>
      )}

      {!compileFailed &&
        result.testCases.map((tc, i) => (
          <div key={i} className="exam-test-case">
            <div className="exam-test-case-head">
              <span>
                {tc.passed ? '✓' : '✗'} Test Case {i + 1}
              </span>
              <span className="meta">
                {tc.passed ? 'Passed' : RUN_STATUS_LABELS[tc.status]}
                {tc.runtimeMs !== null ? ` · ${tc.runtimeMs} ms` : ''}
              </span>
            </div>
            <div className="exam-test-case-body">
              {tc.input !== undefined && (
                <div className="exam-test-case-io">
                  <strong>Input</strong>
                  <pre>{tc.input}</pre>
                </div>
              )}
              {tc.expectedOutput !== undefined && (
                <div className="exam-test-case-io">
                  <strong>Expected Output</strong>
                  <pre>{tc.expectedOutput}</pre>
                </div>
              )}
              {tc.actualOutput !== undefined && (
                <div className="exam-test-case-io">
                  <strong>Your Output</strong>
                  <pre>{tc.actualOutput}</pre>
                </div>
              )}
              {tc.errorMessage && (
                <div className="exam-test-case-io">
                  <strong>{tc.status === 'TIME_LIMIT_EXCEEDED' ? 'Details' : 'Runtime Error'}</strong>
                  <pre>{tc.errorMessage}</pre>
                </div>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  switch (state) {
    case 'saving':
      return <span className="save-indicator unsaved">Saving…</span>;
    case 'saved':
      return <span className="save-indicator saved">✓ Saved</span>;
    case 'unsaved':
      return <span className="save-indicator unsaved">Unsaved changes</span>;
    case 'error':
      return <span className="save-indicator error">Failed to save — will retry on next edit</span>;
    default:
      return <span className="save-indicator" />;
  }
}
