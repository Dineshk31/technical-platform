import { CheckCircle2, Target } from 'lucide-react';
import { Markdown } from './Markdown';

/**
 * The reading part of a lesson — objectives, explanation, worked example, common
 * mistakes. Shared by the student lesson page and the admin editor's "Preview as
 * student", so what an author previews is exactly what ships.
 */
export function LessonBody({
  objectives,
  concept,
  example,
  commonMistakes,
}: {
  objectives: string[];
  concept: string;
  example?: string | null;
  commonMistakes?: string | null;
}) {
  return (
    <>
      {objectives.length > 0 && (
        <section className="card lesson-objectives" aria-labelledby="objectives-heading">
          <h2 id="objectives-heading" className="lesson-section-title">
            <Target size={17} aria-hidden="true" /> What you'll be able to do
          </h2>
          <ul>
            {objectives.map((o) => (
              <li key={o}>
                <CheckCircle2 size={15} aria-hidden="true" />
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <article className="card lesson-content">
        <Markdown>{concept}</Markdown>
        {example && (
          <>
            <h2 className="lesson-section-title">Worked example</h2>
            <Markdown>{example}</Markdown>
          </>
        )}
        {commonMistakes && (
          <>
            <h2 className="lesson-section-title">Common mistakes</h2>
            <Markdown>{commonMistakes}</Markdown>
          </>
        )}
      </article>
    </>
  );
}
