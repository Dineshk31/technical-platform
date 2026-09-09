import { useState } from 'react';
import { Check, Edit3, RotateCcw, Trash2, X } from 'lucide-react';
import { ApiError } from '../lib/api-client';
import { ApprovalBadge } from './ApprovalBadge';

/**
 * The Phase 3 review/approval workflow UI, shared verbatim by both the coding
 * question editor and the MCQ editor (Phase 11) — approve/reject/notes/history all go
 * through the same `POST /questions/:id/review` endpoint regardless of question type,
 * so there is exactly one review UI, not one per question type (see docs/question-system.md).
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
  onReview: (status: 'APPROVED' | 'NEEDS_EDIT' | 'REJECTED' | 'PENDING_REVIEW', notes?: string) => Promise<unknown>;
  onDelete: () => void;
}) {
  const [reviewNotes, setReviewNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleReview(status: 'APPROVED' | 'NEEDS_EDIT' | 'REJECTED' | 'PENDING_REVIEW') {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onReview(status, reviewNotes.trim() || undefined);
      setReviewNotes('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update review status');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <h2>Review / approval</h2>
      <p>
        Current status: <ApprovalBadge status={approvalStatus} />
      </p>
      {attachedToAssessments.length > 0 && (
        <p className="field-hint">Used by: {attachedToAssessments.map((a) => `${a.title} (${a.status})`).join(', ')}</p>
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
      <div className="action-row">
        <button className="btn-icon" onClick={() => void handleReview('APPROVED')} disabled={submitting || approvalStatus === 'APPROVED'}>
          <Check size={15} /> Approve
        </button>
        <button className="btn-secondary btn-icon" disabled={submitting} onClick={() => void handleReview('NEEDS_EDIT')}>
          <Edit3 size={15} /> Needs edit
        </button>
        <button className="btn-secondary btn-icon" disabled={submitting} onClick={() => void handleReview('REJECTED')}>
          <X size={15} /> Reject
        </button>
        <button className="btn-secondary btn-icon" disabled={submitting} onClick={() => void handleReview('PENDING_REVIEW')}>
          <RotateCcw size={15} /> Send back to review
        </button>
        <button className="btn-danger btn-icon" disabled={submitting} onClick={onDelete}>
          <Trash2 size={15} /> Delete question
        </button>
      </div>

      {reviews.length > 0 && (
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
            {reviews.map((r) => (
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
  );
}
