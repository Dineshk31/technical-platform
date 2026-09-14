import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Edit3, RotateCcw, ShieldCheck, Trash2, X } from 'lucide-react';
import { ApiError } from '../lib/api-client';
import { ApprovalBadge } from './ApprovalBadge';

type ReviewStatus = 'APPROVED' | 'NEEDS_EDIT' | 'REJECTED' | 'PENDING_REVIEW';

const NEXT_STEP_COPY: Record<ReviewStatus, string> = {
  APPROVED: 'This question is approved and can now be attached to any assessment.',
  NEEDS_EDIT: 'Marked as needing edits — update the question, then send it back to review when ready.',
  REJECTED: 'Rejected — this question stays out of the bank until re-reviewed.',
  PENDING_REVIEW: 'Sent back to the review queue for another pass.',
};

/**
 * The Phase 3 review/approval workflow UI, shared verbatim by both the coding
 * question editor and the MCQ editor (Phase 11) — approve/reject/notes/history all go
 * through the same `POST /questions/:id/review` endpoint regardless of question type,
 * so there is exactly one review UI, not one per question type (see docs/question-system.md).
 *
 * Redesigned (§B.2/P0-4 of the transformation plan) to read as the deliberate final
 * step of the AI-generation-and-review workflow rather than a bare CRUD form: a
 * status-forward header, one clear primary action against three secondary ones, and
 * an explicit "what happens next" line once a decision is recorded.
 */
export function QuestionReviewPanel({
  approvalStatus,
  attachedToAssessments,
  reviews,
  onReview,
  onDelete,
}: {
  approvalStatus: string;
  attachedToAssessments: { id: string; title: string; status: string }[];
  reviews: { id: string; status: string; notes: string | null; reviewedBy: { id: string; name: string } | null; createdAt: string }[];
  onReview: (status: ReviewStatus, notes?: string) => Promise<unknown>;
  onDelete: () => void;
}) {
  const [reviewNotes, setReviewNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSet, setJustSet] = useState<ReviewStatus | null>(null);

  async function handleReview(status: ReviewStatus) {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    setJustSet(null);
    try {
      await onReview(status, reviewNotes.trim() || undefined);
      setReviewNotes('');
      setJustSet(status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update review status');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card review-panel">
      <div className="review-panel-header">
        <div className="review-panel-header-icon">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h2 style={{ margin: '0 0 0.2rem' }}>Review &amp; approval</h2>
          <ApprovalBadge status={approvalStatus} />
        </div>
      </div>

      {attachedToAssessments.length > 0 && (
        <p className="field-hint">Used by: {attachedToAssessments.map((a) => `${a.title} (${a.status})`).join(', ')}</p>
      )}

      {justSet && (
        <div className="checklist-item ok review-next-step">
          <Check size={14} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
          <span>
            {NEXT_STEP_COPY[justSet]}
            {justSet === 'APPROVED' && (
              <>
                {' '}
                <Link to="/admin/questions" className="review-next-step-link">
                  View in Question Bank <ArrowRight size={12} style={{ verticalAlign: 'middle' }} />
                </Link>
              </>
            )}
          </span>
        </div>
      )}

      <label htmlFor="review-notes">Review notes (optional, recorded with the next action below)</label>
      <textarea
        id="review-notes"
        rows={2}
        value={reviewNotes}
        onChange={(e) => setReviewNotes(e.target.value)}
        placeholder="e.g. reason for rejection, or what was fixed before approving"
      />
      {error && <p className="form-error">{error}</p>}

      <div className="review-panel-actions">
        <button
          className="btn-icon review-panel-primary"
          onClick={() => void handleReview('APPROVED')}
          disabled={submitting || approvalStatus === 'APPROVED'}
        >
          <Check size={15} /> Approve
        </button>
        <div className="review-panel-secondary-group">
          <button className="btn-secondary btn-small btn-icon" disabled={submitting} onClick={() => void handleReview('NEEDS_EDIT')}>
            <Edit3 size={13} /> Needs edit
          </button>
          <button className="btn-secondary btn-small btn-icon" disabled={submitting} onClick={() => void handleReview('REJECTED')}>
            <X size={13} /> Reject
          </button>
          <button className="btn-secondary btn-small btn-icon" disabled={submitting} onClick={() => void handleReview('PENDING_REVIEW')}>
            <RotateCcw size={13} /> Send back to review
          </button>
        </div>
      </div>

      <div className="review-panel-danger-zone">
        <button className="btn-danger btn-small btn-icon" disabled={submitting} onClick={onDelete}>
          <Trash2 size={13} /> Delete question
        </button>
      </div>

      {reviews.length > 0 && (
        <div className="review-history">
          <p className="review-history-title">Review history</p>
          <div className="activity-list">
            {reviews.map((r) => (
              <div key={r.id} className="activity-row review-history-row">
                <div className="activity-row-main">
                  <ApprovalBadge status={r.status} />
                  {r.notes && <span className="review-history-note">{r.notes}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span className="activity-row-meta">{r.reviewedBy?.name ?? 'System'}</span>
                  <span className="activity-row-meta">{new Date(r.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
