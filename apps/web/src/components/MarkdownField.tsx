import { useId, useState } from 'react';
import { Markdown } from './Markdown';

/**
 * A lesson-content textarea with a Write / Preview toggle. Preview uses the exact
 * `<Markdown>` renderer students see, so what the author previews is what ships.
 */
export function MarkdownField({
  label,
  hint,
  value,
  onChange,
  rows = 8,
  required,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  required?: boolean;
}) {
  const [preview, setPreview] = useState(false);
  const id = useId();
  return (
    <div>
      <div className="tabs" role="tablist" aria-label={`${label} editor`} style={{ marginBottom: 'var(--space-3)' }}>
        <button type="button" role="tab" aria-selected={!preview} className={`tab${!preview ? ' active' : ''}`} onClick={() => setPreview(false)}>
          Write
        </button>
        <button type="button" role="tab" aria-selected={preview} className={`tab${preview ? ' active' : ''}`} onClick={() => setPreview(true)}>
          Preview
        </button>
      </div>
      <label htmlFor={id}>{label}</label>
      {hint && <p className="field-hint" style={{ marginTop: 0 }}>{hint}</p>}
      {preview ? (
        <div className="markdown-preview">{value.trim() ? <Markdown>{value}</Markdown> : <p className="field-hint">Nothing to preview yet.</p>}</div>
      ) : (
        <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} required={required} style={{ fontFamily: 'var(--font-mono)' }} />
      )}
    </div>
  );
}
