import { Modal } from '../../components/Modal';
import type { StudentSectionDto } from '../../lib/attempts-api';
import { QUESTION_STATUS_LABELS, questionStatusPillClass } from '../../lib/verdict';

/**
 * The deliberate "review before you submit" surface the exam experience was
 * missing — previously "Submit assessment" went straight to a text-only
 * confirm dialog naming an unanswered count with no way to see *which*
 * questions those were. This lists every question, grouped by section, with
 * its real (server-computed) status, and lets the student jump straight to
 * any of them before committing — matching how a real proctored exam tool
 * makes you review your paper before handing it in.
 */
export function SubmitReviewModal({
  open,
  onClose,
  sections,
  onSelectQuestion,
  onConfirmSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  sections: StudentSectionDto[];
  onSelectQuestion: (questionId: string) => void;
  onConfirmSubmit: () => void;
  submitting: boolean;
}) {
  const flat = sections.flatMap((s) => s.questions);
  const answered = flat.filter((q) => q.status !== 'NOT_ATTEMPTED').length;
  const unanswered = flat.length - answered;

  return (
    <Modal open={open} onClose={onClose}>
      <div style={{ padding: '1.5rem', width: 480, maxWidth: '90vw' }}>
        <h2 style={{ marginTop: 0 }}>Review before you submit</h2>

        <div className="result-summary-grid" style={{ marginBottom: '1rem' }}>
          <div className="result-stat">
            <div className="result-stat-value">{answered}</div>
            <div className="result-stat-label">Answered</div>
          </div>
          <div className="result-stat">
            <div className="result-stat-value">{unanswered}</div>
            <div className="result-stat-label">Unanswered</div>
          </div>
          <div className="result-stat">
            <div className="result-stat-value">{flat.length}</div>
            <div className="result-stat-label">Total</div>
          </div>
        </div>

        {unanswered > 0 && (
          <p className="form-error" style={{ marginTop: 0, marginBottom: '0.85rem' }}>
            You have {unanswered} unanswered question{unanswered === 1 ? '' : 's'}. You can still go back and answer them —
            click any question below to jump straight to it.
          </p>
        )}

        <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
          {sections.map((section) => (
            <div key={section.id}>
              <div
                style={{
                  padding: '0.45rem 0.85rem',
                  background: 'var(--color-surface-secondary)',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  color: 'var(--color-muted)',
                }}
              >
                {section.title}
              </div>
              {section.questions.map((q, i) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onSelectQuestion(q.id)}
                  className="btn-ghost"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    padding: '0.55rem 0.85rem',
                    border: 'none',
                    borderBottom: '1px solid var(--color-border)',
                    borderRadius: 0,
                    background: 'transparent',
                    fontWeight: 400,
                    textAlign: 'left',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '0.5rem' }}>
                    Q{i + 1}. {q.title}
                  </span>
                  <span className={`exam-status-pill ${questionStatusPillClass(q.status)}`} style={{ flexShrink: 0 }}>
                    {QUESTION_STATUS_LABELS[q.status]}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="action-row" style={{ marginTop: '1.2rem', justifyContent: 'flex-end', marginBottom: 0 }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
            Continue working
          </button>
          <button type="button" className="btn-danger" disabled={submitting} onClick={onConfirmSubmit}>
            {submitting ? 'Submitting…' : 'Submit assessment'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
