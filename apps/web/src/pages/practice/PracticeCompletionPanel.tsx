import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Code2, History } from 'lucide-react';
import type { SubmissionDetailDto } from '../../lib/attempts-api';
import type { PracticeQuestionListItem } from '../../lib/practice-api';
import { DifficultyBadge } from '../../components/ApprovalBadge';

/**
 * The "I solved it — now what?" moment (§B.3.1 of the transformation plan):
 * previously solving a practice problem was a dead end — the workspace just
 * showed a test breakdown with nowhere to go next. Shown only when a SUBMIT
 * reaches ACCEPTED; every other verdict keeps the plain test-breakdown panel
 * below this, unchanged.
 */
export function PracticeCompletionPanel({
  title,
  difficulty,
  result,
  nextProblem,
  nextProblemLoading,
  onViewHistory,
}: {
  title: string;
  difficulty: string;
  result: SubmissionDetailDto;
  nextProblem: PracticeQuestionListItem | null;
  nextProblemLoading: boolean;
  onViewHistory: () => void;
}) {
  return (
    <div className="practice-completion">
      <div className="practice-completion-head">
        <CheckCircle2 size={28} />
        <div>
          <p className="practice-completion-eyebrow">Accepted</p>
          <p className="practice-completion-title">{title}</p>
          <p className="practice-completion-meta">
            <DifficultyBadge difficulty={difficulty} /> · {result.testsPassed}/{result.testsTotal} tests passed · solution
            recorded to your submission history
          </p>
        </div>
      </div>

      <div className="practice-completion-actions">
        {nextProblemLoading ? (
          <button type="button" className="btn-on-accent btn-icon" disabled>
            Finding your next problem…
          </button>
        ) : nextProblem ? (
          <Link to={`/student/practice/problems/${nextProblem.id}`}>
            <button type="button" className="btn-on-accent btn-icon">
              Next problem: {nextProblem.title} <ArrowRight size={15} />
            </button>
          </Link>
        ) : (
          <Link to="/student/practice/problems">
            <button type="button" className="btn-on-accent btn-icon">
              <Code2 size={15} /> Browse more problems
            </button>
          </Link>
        )}
        <Link to="/student/practice/problems">
          <button type="button" className="btn-secondary btn-small btn-icon practice-completion-secondary">
            <ArrowRight size={13} style={{ transform: 'rotate(180deg)' }} /> Back to problems
          </button>
        </Link>
        <button type="button" className="btn-secondary btn-small btn-icon practice-completion-secondary" onClick={onViewHistory}>
          <History size={13} /> View submission history
        </button>
      </div>
    </div>
  );
}
