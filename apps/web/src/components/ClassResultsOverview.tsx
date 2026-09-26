import { BarChart3, CheckCircle2, Target, Users } from 'lucide-react';
import type { ClassResultsSummaryDto } from '../lib/results-api';
import { StatCard } from './Card';
import { EmptyState } from './EmptyState';

function Bar({ value, label, warn }: { value: number; label: string; warn?: boolean }) {
  return (
    <div className="progress-track" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-fill" style={{ width: `${Math.min(100, value)}%`, background: warn ? 'var(--color-warning)' : undefined }} />
    </div>
  );
}

/**
 * Class-level view above the admin results roster: how the whole cohort did, which
 * topics to reteach, and which questions nobody cracked. Every number comes from
 * GET /assessments/:id/results/summary, which re-derives each finalized attempt with
 * the same scoring function as the individual result pages — so the class view and
 * a student's own result can never disagree. Uses the student page's "needs work"
 * rule (under half a topic's marks) so faculty and students see the same judgement.
 */
export function ClassResultsOverview({ summary }: { summary: ClassResultsSummaryDto }) {
  const { participants, completed, inProgress, notStarted } = summary;

  return (
    <>
      <div className="stat-card-grid">
        <StatCard label="Participants" value={participants} icon={<Users size={18} />} />
        <StatCard
          label="Completed"
          value={completed}
          hint={`${inProgress} in progress · ${notStarted} not started`}
          icon={<CheckCircle2 size={18} />}
        />
        <StatCard
          label="Class average"
          value={summary.averagePercentage !== null ? `${summary.averagePercentage}%` : '—'}
          hint={
            summary.highestPercentage !== null
              ? `Highest ${summary.highestPercentage}% · Lowest ${summary.lowestPercentage}%`
              : 'Appears once a student finishes'
          }
          icon={<BarChart3 size={18} />}
        />
      </div>

      {completed === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Target size={22} />}
            title="No completed attempts yet"
            description="Topic and question insights appear here as soon as the first student finishes."
          />
        </div>
      ) : (
        <>
          {summary.topics.length > 0 && (
            <div className="card">
              <div className="page-header" style={{ marginBottom: '0.35rem' }}>
                <h2 style={{ margin: 0 }}>Topic performance</h2>
              </div>
              <p className="field-hint" style={{ marginTop: 0 }}>
                Class average per topic, weakest first. A student needs work on a topic when they earned less than half of its marks.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.85rem', marginTop: '0.75rem' }}>
                {summary.topics.map((t) => (
                  <div key={t.topic} className="card" style={{ padding: '0.85rem 1rem', margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <strong style={{ fontSize: '0.9rem' }}>{t.topic}</strong>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t.averagePercentage}%</span>
                    </div>
                    <Bar value={t.averagePercentage} label={`${t.topic}: class average ${t.averagePercentage}%`} warn={t.averagePercentage < 50} />
                    <div style={{ fontSize: '0.8rem', marginTop: '0.45rem' }}>
                      {t.studentsNeedingWork > 0 ? (
                        <span className="badge badge-warning">
                          {t.studentsNeedingWork} of {t.students} {t.students === 1 ? 'student needs' : 'students need'} work
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-muted)' }}>No student below half marks</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="page-header" style={{ marginBottom: '0.35rem' }}>
              <h2 style={{ margin: 0 }}>Question performance</h2>
            </div>
            <p className="field-hint" style={{ marginTop: 0 }}>
              Across the {completed} completed {completed === 1 ? 'attempt' : 'attempts'}, in assessment order.
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Difficulty</th>
                    <th>Solved</th>
                    <th>Attempted</th>
                    <th>Avg. marks</th>
                    <th style={{ minWidth: 140 }}>Solve rate</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.questions.map((q) => (
                    <tr key={q.questionId}>
                      <td>
                        {q.title}
                        {q.topics.length > 0 && <div style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>{q.topics.join(' · ')}</div>}
                      </td>
                      <td>{q.difficulty}</td>
                      <td>
                        {q.solved} / {completed}
                      </td>
                      <td>
                        {q.attempted} / {completed}
                      </td>
                      <td>
                        {q.averageMarks} / {q.maxMarks}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ flex: 1 }}>
                            <Bar value={q.solveRate} label={`${q.title}: ${q.solveRate}% solved`} warn={q.solveRate < 50} />
                          </div>
                          <span style={{ fontSize: '0.8rem', minWidth: '3.2em', textAlign: 'right' }}>{q.solveRate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
