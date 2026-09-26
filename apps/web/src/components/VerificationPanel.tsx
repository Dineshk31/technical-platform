import { useEffect, useState } from 'react';
import { CircleCheck, CircleX, FlaskConical, Loader2, Play } from 'lucide-react';
import { ApiError } from '../lib/api-client';
import type { QuestionVerification, VerificationStatus } from '../lib/questions-api';
import { VERDICT_LABELS } from '../lib/verdict';

const verdictLabel = (v: string) => (VERDICT_LABELS as Record<string, string>)[v] ?? v;

const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  PASSED: 'Verified',
  FAILED: 'Verification failed',
  PENDING: 'Verifying…',
  UNVERIFIED: 'Not verified',
};

const BADGE_CLASS: Record<VerificationStatus, string> = {
  PASSED: 'badge-success',
  FAILED: 'badge-danger',
  PENDING: 'badge-info',
  UNVERIFIED: 'badge-neutral',
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return <span className={`badge ${BADGE_CLASS[status]}`}>{VERIFICATION_LABELS[status]}</span>;
}

const POLL_MS = 1500;
const POLL_LIMIT_MS = 90_000;

/**
 * Phase 18 — the admin side of the reference-solution verification gate. Shows, per
 * reference language, whether its code passed ALL tests (public and hidden) in the real
 * execution service, and for a failure exactly which test failed with its input,
 * expected and actual output — enough to decide whether the test or the solution is
 * wrong. Polls while a run is in flight; `onRefresh` reloads the question.
 */
export function VerificationPanel({
  verification,
  testCount,
  onVerify,
  onRefresh,
}: {
  verification: QuestionVerification;
  testCount: number;
  onVerify: () => Promise<unknown>;
  onRefresh: () => Promise<unknown>;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = verification.status === 'PENDING';

  useEffect(() => {
    if (!pending) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > POLL_LIMIT_MS) {
        clearInterval(timer);
        return;
      }
      void onRefresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pending, onRefresh]);

  async function handleVerify() {
    setError(null);
    setStarting(true);
    try {
      await onVerify();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start verification');
    } finally {
      setStarting(false);
    }
  }

  const { status, solutions } = verification;

  return (
    <div className="card review-panel" aria-live="polite">
      <div className="review-panel-header">
        <div className="review-panel-header-icon">
          <FlaskConical size={20} />
        </div>
        <div>
          <h2 style={{ margin: '0 0 0.2rem' }}>Reference solution verification</h2>
          <VerificationBadge status={status} />
        </div>
      </div>

      <p className="field-hint" style={{ marginTop: 0 }}>
        Every reference solution is run against all {testCount} test{testCount === 1 ? '' : 's'} — public and hidden — in the
        real execution service. The question can only be approved once every one passes. Changing a test, a reference solution
        or the limits resets this.
      </p>

      {solutions.length === 0 ? (
        <p style={{ margin: '0 0 0.75rem' }}>Add a reference solution above to verify this question.</p>
      ) : (
        <div className="activity-list" style={{ marginBottom: '0.75rem' }}>
          {solutions.map((s) => (
            <div key={s.language} style={{ padding: '0.6rem 0', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                {s.status === 'PASSED' ? (
                  <CircleCheck size={16} color="var(--color-success)" aria-hidden="true" />
                ) : s.status === 'FAILED' ? (
                  <CircleX size={16} color="var(--color-error)" aria-hidden="true" />
                ) : s.status === 'PENDING' ? (
                  <Loader2 size={16} className="spin" aria-hidden="true" />
                ) : (
                  <span style={{ width: 16 }} />
                )}
                <strong>{s.language}</strong>
                <VerificationBadge status={s.status} />
                {s.status !== 'UNVERIFIED' && s.status !== 'PENDING' && (
                  <span className="activity-row-meta">
                    {s.testsPassed}/{s.testsTotal} tests passed
                    {s.verdict && s.verdict !== 'ACCEPTED' ? ` · ${verdictLabel(s.verdict)}` : ''}
                    {s.completedAt ? ` · ${new Date(s.completedAt).toLocaleString()}` : ''}
                  </span>
                )}
              </div>
              {s.status === 'FAILED' && s.failures.length === 0 && s.errorMessage && (
                <pre className="example-block" style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem' }}>
                  {s.errorMessage}
                </pre>
              )}
              {s.failures.slice(0, 3).map((f) => (
                <div key={f.testCaseId} style={{ marginTop: '0.5rem' }}>
                  <p className="field-hint" style={{ margin: '0 0 0.25rem' }}>
                    {f.isHidden ? 'Hidden' : 'Public'} test #{f.orderIndex + 1} — {verdictLabel(f.status)}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem' }}>
                    {(
                      [
                        ['Input', f.input],
                        ['Expected', f.expectedOutput],
                        ['Actual', f.actualOutput ?? f.errorMessage ?? '(no output)'],
                      ] as const
                    ).map(([label, text]) => (
                      <div key={label}>
                        <p className="field-hint" style={{ margin: '0 0 0.15rem' }}>
                          {label}
                        </p>
                        <pre className="example-block" style={{ whiteSpace: 'pre-wrap', margin: 0, maxHeight: 160, overflow: 'auto' }}>
                          {text}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {s.failures.length > 3 && <p className="field-hint">…and {s.failures.length - 3} more failing tests.</p>}
            </div>
          ))}
        </div>
      )}

      {error && <p className="form-error">{error}</p>}
      <button className="btn-icon" onClick={() => void handleVerify()} disabled={starting || pending || solutions.length === 0}>
        <Play size={14} /> {pending ? 'Verification running…' : status === 'UNVERIFIED' ? 'Verify now' : 'Re-run verification'}
      </button>
    </div>
  );
}
