import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import type { StudentMcqQuestionDto } from '../../lib/attempts-api';
import { DifficultyBadge } from '../../components/ApprovalBadge';
import { SaveIndicator } from './SaveIndicator';

/**
 * The MCQ answer panel — single/multi-select options, no test cases or editor, no
 * isCorrect/explanation anywhere in the data it's given (structurally absent from
 * StudentMcqQuestionDto, see docs/security.md §2). Selecting an option saves
 * immediately (no debounce — a discrete click, unlike code's continuous typing); the
 * only feedback shown is "saved" state, never correctness.
 */
export function McqQuestionPanel({
  question,
  selectedOptionIds,
  saving,
  error,
  isActive,
  onToggle,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
}: {
  question: StudentMcqQuestionDto;
  selectedOptionIds: string[];
  saving: boolean;
  error: string | undefined;
  isActive: boolean;
  onToggle: (optionId: string) => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const isMulti = question.mcqType === 'MULTIPLE_CHOICE';
  const selected = new Set(selectedOptionIds);

  return (
    <div className="exam-problem-panel" style={{ maxWidth: 760 }}>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>{question.title}</h2>
        <DifficultyBadge difficulty={question.difficulty} />
      </div>
      <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>
        Marks: {question.marks} · {isMulti ? 'Select all that apply' : 'Select one answer'}
      </p>

      <p style={{ whiteSpace: 'pre-wrap' }}>{question.questionText}</p>
      {question.codeSnippet && (
        <div className="example-block">
          <pre>{question.codeSnippet}</pre>
        </div>
      )}

      <div style={{ margin: '1rem 0' }}>
        {question.options.map((option) => {
          const isSelected = selected.has(option.id);
          return (
            <label key={option.id} className={`mcq-option ${isSelected ? 'selected' : ''}`}>
              <input
                type={isMulti ? 'checkbox' : 'radio'}
                name={`mcq-${question.questionId}`}
                checked={isSelected}
                disabled={!isActive || saving}
                onChange={() => onToggle(option.id)}
              />
              <span>{option.optionText}</span>
            </label>
          );
        })}
      </div>

      <div style={{ minHeight: '1.2rem' }}>
        {saving && <SaveIndicator state="saving" />}
        {!saving && !error && selectedOptionIds.length > 0 && (
          <span className="save-indicator saved">
            <Check size={13} /> Saved
          </span>
        )}
        {error && <span className="save-indicator error">{error}</span>}
      </div>

      <div className="action-row" style={{ marginTop: '1rem' }}>
        <button className="btn-secondary btn-icon" disabled={!canGoPrev} onClick={onPrev}>
          <ArrowLeft size={15} /> Previous
        </button>
        <button className="btn-secondary btn-icon" disabled={!canGoNext} onClick={onNext}>
          Next <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
