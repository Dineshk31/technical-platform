import type { StudentAssignedListItem } from './assessments-api';

export interface StudentAssessmentGroups {
  activeInProgress: StudentAssignedListItem[];
  activeNotStarted: StudentAssignedListItem[];
  activeAwaitingResults: StudentAssignedListItem[];
  upcoming: StudentAssignedListItem[];
  completed: StudentAssignedListItem[];
}

/**
 * The one place a student's assessments are split into groups — shared by Student
 * Home and the dedicated Assessments page so both surfaces show the exact same
 * buckets for the same underlying state (see docs/FINAL_PRODUCT_TRANSFORMATION_PLAN.md
 * §D.1 — the Assessments page reuses this grouping logic verbatim, not a re-derivation).
 */
export function groupStudentAssessments(assessments: StudentAssignedListItem[]): StudentAssessmentGroups {
  return {
    activeInProgress: assessments.filter(
      (a) => a.status === 'ACTIVE' && a.hasStarted && a.attemptStatus === 'IN_PROGRESS',
    ),
    activeNotStarted: assessments.filter((a) => a.status === 'ACTIVE' && !a.hasStarted),
    activeAwaitingResults: assessments.filter(
      (a) => a.status === 'ACTIVE' && a.hasStarted && a.attemptStatus !== 'IN_PROGRESS',
    ),
    upcoming: assessments.filter((a) => a.status === 'PUBLISHED'),
    completed: assessments.filter((a) => a.status === 'COMPLETED' || a.status === 'ARCHIVED'),
  };
}
