import { QUESTION_STATUS_LABELS, VERDICT_LABELS, questionStatusPillClass, type QuestionResultStatus } from '../lib/verdict';
import type { SectionResultDto } from '../lib/results-api';

/** The per-section/per-question breakdown table — shared by the student's own
 * result page and the admin per-attempt detail page, so the two views never
 * drift apart. Purely presentational: every number here comes from the
 * server (docs: "frontend calculations are display-only"). */
export function ResultBreakdown({ sections }: { sections: SectionResultDto[] }) {
  return (
    <>
      {sections.map((section) => (
        <div className="card" key={section.sectionId}>
          <h2 style={{ marginBottom: '0.3rem' }}>{section.title}</h2>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem', marginTop: 0 }}>
            Score: {section.marksObtained} / {section.maxMarks} · Solved: {section.solvedQuestions} / {section.totalQuestions}
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Question</th>
                <th>Difficulty</th>
                <th>Status</th>
                <th>Verdict</th>
                <th>Marks</th>
              </tr>
            </thead>
            <tbody>
              {section.questions.map((q) => (
                <tr key={q.questionId}>
                  <td>{q.title}</td>
                  <td>{q.difficulty}</td>
                  <td>
                    <span className={`badge ${questionStatusPillClass(q.status as QuestionResultStatus)}`}>
                      {QUESTION_STATUS_LABELS[q.status as QuestionResultStatus]}
                    </span>
                  </td>
                  <td>{q.verdict ? VERDICT_LABELS[q.verdict] : '—'}</td>
                  <td>
                    {q.marksObtained} / {q.maxMarks}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
