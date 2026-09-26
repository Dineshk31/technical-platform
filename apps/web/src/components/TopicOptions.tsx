import { TOPIC_AREAS } from '@technical-platform/shared';

/**
 * `<option>`s for a topic `<select>`, grouped by catalog area (Phase 18's shared
 * TOPICS catalog). `only` narrows it to a subset — e.g. CODING_TOPICS for a coding
 * problem — and empty groups are dropped rather than rendered as bare headings.
 */
export function TopicOptions({ only }: { only?: readonly string[] }) {
  return (
    <>
      {TOPIC_AREAS.map(({ area, topics }) => {
        const visible = only ? topics.filter((t) => only.includes(t)) : topics;
        if (visible.length === 0) return null;
        return (
          <optgroup key={area} label={area}>
            {visible.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}
