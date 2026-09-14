import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Code2 } from 'lucide-react';
import { ApiError } from '../lib/api-client';
import { listAssignedAssessments, type StudentAssignedListItem } from '../lib/assessments-api';
import { groupStudentAssessments } from '../lib/assessment-groups';
import { AssessmentRow } from '../components/AssessmentRow';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';

const GROUPS: { key: keyof ReturnType<typeof groupStudentAssessments>; title: string }[] = [
  { key: 'activeInProgress', title: 'In progress' },
  { key: 'activeNotStarted', title: 'Available now' },
  { key: 'activeAwaitingResults', title: 'Submitted — awaiting results' },
  { key: 'upcoming', title: 'Upcoming' },
  { key: 'completed', title: 'Completed' },
];

/** A dedicated nav destination for "I want my assessment list" (§D.1 of the
 * transformation plan) — previously a student could only reach this by scrolling
 * Home. Zero new backend work: reuses `GET /assessments/assigned` and the exact
 * same grouping/row rendering Home already ships. */
export function StudentAssessmentsPage() {
  const [assessments, setAssessments] = useState<StudentAssignedListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAssignedAssessments()
      .then((res) => setAssessments(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load your assessments'))
      .finally(() => setLoading(false));
  }, []);

  const groups = groupStudentAssessments(assessments);

  return (
    <div className="dashboard-body">
      <PageHeader title="Assessments" subtitle="Everything assigned to you, grouped by what to do next." />

      {error && <ErrorState message={error} />}

      {loading ? (
        <div className="card">
          <Skeleton height="4rem" />
        </div>
      ) : assessments.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<CalendarClock size={22} />}
            title="No assessments assigned yet"
            description="When your instructor assigns you a technical assessment, it will show up here. In the meantime, you can start practicing right away — no assignment needed."
            action={
              <Link to="/student/practice/problems">
                <button className="btn-icon">
                  <Code2 size={15} /> Start practicing
                </button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="card">
          {GROUPS.map(({ key, title }) => {
            const items = groups[key];
            if (items.length === 0) return null;
            return (
              <div key={key}>
                <div className="assessment-group-title">{title}</div>
                {items.map((a) => (
                  <AssessmentRow key={a.id} assessment={a} />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
