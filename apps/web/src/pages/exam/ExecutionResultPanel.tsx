import { Check, X } from 'lucide-react';
import type { SubmissionDetailDto } from '../../lib/attempts-api';
import { statusPillClass } from '../../lib/verdict';
import { RUN_STATUS_LABELS } from './constants';

/**
 * Renders one execution result — used for both Run (public tests only, never
 * has isHidden=true rows) and Submit (public + hidden). Hidden rows never
 * carry input/expectedOutput/actualOutput (the API's DTO structurally omits
 * them — see docs/security.md §2), so this component naturally shows "Hidden
 * Test — Passed/Failed" with no I/O panels for those rows without needing any
 * isHidden-specific branching of its own.
 */
export function ExecutionResultPanel({ title, result, marks }: { title: string; result: SubmissionDetailDto; marks?: number }) {
  const compileFailed = result.status === 'COMPILATION_ERROR';
  const isGraded = result.kind === 'SUBMIT';
  const publicCases = result.testCases.filter((tc) => !tc.isHidden);
  const hiddenCases = result.testCases.filter((tc) => tc.isHidden);
  return (
    <div className="exam-run-results">
      <div className="exam-run-summary">
        <strong style={{ fontSize: '0.8rem' }}>{title}</strong>
        <span className={`exam-status-pill ${statusPillClass(result.status)}`}>{RUN_STATUS_LABELS[result.status]}</span>
        {!compileFailed && (
          <span style={{ color: 'var(--color-muted)' }}>
            {result.testsPassed} / {result.testsTotal} tests passed
            {hiddenCases.length > 0
              ? ` (${publicCases.filter((tc) => tc.passed).length}/${publicCases.length} public, ${hiddenCases.filter((tc) => tc.passed).length}/${hiddenCases.length} hidden)`
              : ''}
          </span>
        )}
        {isGraded && marks !== undefined && (
          <span style={{ color: 'var(--color-muted)', fontWeight: 600 }}>
            Score: {result.score} / {marks}
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
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {tc.passed ? (
                  <Check size={14} style={{ color: 'var(--color-success)' }} />
                ) : (
                  <X size={14} style={{ color: 'var(--color-error)' }} />
                )}
                {tc.isHidden ? `Hidden Test ${i + 1}` : `Test Case ${i + 1}`}
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
