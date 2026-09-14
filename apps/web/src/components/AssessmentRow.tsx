import { Link } from 'react-router-dom';
import type { StudentAssignedListItem } from '../lib/assessments-api';

/** One assessment row, shared verbatim by Student Home's condensed view and the
 * dedicated Assessments page — same data, same link-resolution rule, so the two
 * surfaces never drift into showing different CTAs for the same assessment state. */
export function AssessmentRow({ assessment }: { assessment: StudentAssignedListItem }) {
  const isOngoing = assessment.hasStarted && assessment.attemptStatus === 'IN_PROGRESS' && assessment.status === 'ACTIVE';
  const linkTo =
    assessment.hasStarted && assessment.attemptId
      ? isOngoing
        ? `/student/attempts/${assessment.attemptId}`
        : `/student/attempts/${assessment.attemptId}/result`
      : `/student/assessments/${assessment.id}`;
  const linkLabel = assessment.hasStarted ? (isOngoing ? 'Resume' : 'View result') : 'View';

  return (
    <div className="assessment-row">
      <div>
        <p className="assessment-row-title">{assessment.title}</p>
        <p className="assessment-row-meta">
          {new Date(assessment.startAt).toLocaleString()} → {new Date(assessment.endAt).toLocaleString()} · {assessment.maxMarks} marks
        </p>
      </div>
      <Link to={linkTo}>
        <button className="btn-secondary btn-small">{linkLabel}</button>
      </Link>
    </div>
  );
}
