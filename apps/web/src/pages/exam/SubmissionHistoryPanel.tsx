import type { SubmissionHistoryItemDto } from '../../lib/attempts-api';
import { statusPillClass } from '../../lib/verdict';
import { LoadingRow } from '../../components/Skeleton';
import { HISTORY_KIND_LABEL, RUN_STATUS_LABELS } from './constants';

/** Safe-by-construction: SubmissionHistoryItemDto has no field for hidden test
 * input/output/actual output — there is nothing here that could leak them. */
export function SubmissionHistoryPanel({ items, loading, marks }: { items: SubmissionHistoryItemDto[]; loading: boolean; marks: number }) {
  return (
    <div className="exam-run-results exam-history-panel">
      <strong style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.5rem' }}>Submission history</strong>
      {loading && <LoadingRow label="Loading…" />}
      {!loading && items.length === 0 && (
        <p style={{ color: 'var(--color-muted)', fontSize: '0.82rem' }}>No runs or submissions yet for this question.</p>
      )}
      {!loading && items.length > 0 && (
        <div className="table-wrap">
          <table className="exam-history-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Language</th>
                <th>Verdict</th>
                <th>Tests</th>
                <th>Score</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{HISTORY_KIND_LABEL[item.kind]}</td>
                  <td>{item.language}</td>
                  <td>
                    <span className={`exam-status-pill ${statusPillClass(item.status)}`}>{RUN_STATUS_LABELS[item.status]}</span>
                  </td>
                  <td>
                    {item.testsPassed}/{item.testsTotal}
                  </td>
                  <td>{item.kind === 'SUBMIT' ? `${item.score}/${marks}` : '—'}</td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
