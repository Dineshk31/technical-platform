import { useState } from 'react';
import { CheckCircle2, CircleAlert, RotateCcw } from 'lucide-react';
import { ApiError } from '../lib/api-client';
import { answerLessonCheck, type LessonCheckAnswerResult, type StudentLessonCheck } from '../lib/learn-api';
import { Markdown } from './Markdown';

/**
 * One knowledge check inside a lesson (Phase 18). Graded on the server — the page
 * never knows which option is right until the student's own answer comes back — with
 * the explanation shown only after answering. A wrong answer can be retried; a correct
 * one is locked in (the server keeps it too, so passing can't be undone).
 */
export function KnowledgeCheckCard({
  lessonId,
  check,
  index,
  onAnswered,
}: {
  lessonId: string;
  check: StudentLessonCheck;
  index: number;
  onAnswered: (result: LessonCheckAnswerResult) => void;
}) {
  const [selected, setSelected] = useState<string[]>(check.answer?.selectedOptionIds ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answer = check.answer;
  const locked = answer?.isCorrect === true;
  // Feedback belongs to the submitted answer; once the student changes a wrong
  // selection, hide it until they check again.
  const showFeedback = answer !== null && (locked || sameSet(selected, answer.selectedOptionIds));
  const name = `check-${check.questionId}`;

  function toggle(optionId: string) {
    if (locked) return;
    setSelected((prev) => (check.multiple ? (prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]) : [optionId]));
  }

  async function submit() {
    if (selected.length === 0 || submitting || locked) return;
    setError(null);
    setSubmitting(true);
    try {
      onAnswered(await answerLessonCheck(lessonId, check.questionId, selected));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not check your answer — try again');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`kc-card${locked ? ' kc-card-passed' : ''}`}>
      <fieldset className="kc-fieldset" disabled={locked || submitting}>
        <legend className="kc-question">
          <span className="kc-number">Question {index + 1}</span>
          {check.questionText}
          {check.multiple && <span className="field-hint"> (select all that apply)</span>}
        </legend>
        {check.codeSnippet && (
          <pre className="example-block" style={{ whiteSpace: 'pre-wrap' }}>
            {check.codeSnippet}
          </pre>
        )}
        <div className="kc-options">
          {check.options.map((o) => {
            const isSelected = selected.includes(o.id);
            return (
              <label key={o.id} className={`kc-option${isSelected ? ' selected' : ''}`}>
                <input
                  type={check.multiple ? 'checkbox' : 'radio'}
                  name={name}
                  checked={isSelected}
                  onChange={() => toggle(o.id)}
                />
                <span>{o.optionText}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div aria-live="polite">
        {showFeedback && answer && (
          <div className={`kc-feedback ${answer.isCorrect ? 'correct' : 'wrong'}`}>
            <p className="kc-feedback-title">
              {answer.isCorrect ? <CheckCircle2 size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}
              {answer.isCorrect ? 'Correct' : 'Not quite — review the explanation and try again'}
            </p>
            {answer.explanation && <Markdown>{answer.explanation}</Markdown>}
          </div>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}

      {!locked && (
        <button
          type="button"
          className="btn-small btn-icon"
          onClick={() => void submit()}
          disabled={selected.length === 0 || submitting || (answer !== null && !answer.isCorrect && sameSet(selected, answer.selectedOptionIds))}
        >
          {answer && !answer.isCorrect ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />}
          {submitting ? 'Checking…' : answer && !answer.isCorrect ? 'Try again' : 'Check answer'}
        </button>
      )}
    </div>
  );
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}
