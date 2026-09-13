import { Check } from 'lucide-react';

export interface StepDefinition {
  key: string;
  label: string;
  /** Short status line under the label, e.g. "2 sections · 5 questions" — real
   * data only, never a placeholder (see docs/PRODUCT_TRANSFORMATION_AUDIT.md §5 P0-C). */
  hint?: string;
  /** A step the builder can already consider satisfied — drives the checkmark
   * and the "done" styling. Never blocks navigation by itself; see `disabled`. */
  done?: boolean;
}

/**
 * The Assessment Builder's step rail. Deliberately dumb: it renders whatever
 * steps/hints/done-flags the caller computes from the real assessment record —
 * it has no validation logic of its own (that stays server-side, reused via
 * the publish endpoint's own `details[]`, not re-implemented here).
 */
export function Stepper({
  steps,
  currentKey,
  onSelect,
  disabledKeys,
}: {
  steps: StepDefinition[];
  currentKey: string;
  onSelect: (key: string) => void;
  disabledKeys?: Set<string>;
}) {
  return (
    <div className="stepper" role="tablist" aria-label="Assessment builder steps">
      {steps.map((step, i) => {
        const isCurrent = step.key === currentKey;
        const isDisabled = disabledKeys?.has(step.key) ?? false;
        return (
          <button
            key={step.key}
            type="button"
            role="tab"
            aria-selected={isCurrent}
            className={`stepper-step ${isCurrent ? 'current' : ''} ${step.done ? 'done' : ''}`}
            disabled={isDisabled}
            onClick={() => onSelect(step.key)}
          >
            <span className="stepper-step-index">{step.done ? <Check size={13} /> : i + 1}</span>
            <span>
              <div className="stepper-step-label">{step.label}</div>
              {step.hint && <div className="stepper-step-hint">{step.hint}</div>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
