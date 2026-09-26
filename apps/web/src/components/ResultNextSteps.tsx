import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Code2, Compass } from 'lucide-react';
import type { TopicResultDto } from '../lib/results-api';
import { listPracticeQuestions, type PracticeQuestionListItem } from '../lib/practice-api';
import { getLearnProgress } from '../lib/learn-api';
import { LoadingRow } from './Skeleton';

const MAX_TOPICS = 3;
const PROBLEMS_PER_TOPIC = 3;

interface TopicPlan {
  topic: TopicResultDto;
  lessonCount: number;
  lessonsCompleted: number;
  problems: PracticeQuestionListItem[];
}

/**
 * "What next" after an assessment — the step that closes the loop from Result back
 * to Learn/Practice. For each topic the server flagged `needsWork` (weakest first,
 * at most 3) it offers only things that really exist: the topic's published lessons
 * (if any — labelled "Review" once they've all been completed) and this student's
 * own unsolved problems in it, ordered by the Explorer's existing 'recommended' rule. Nothing is invented — a topic with neither says so.
 * Each lookup fails independently, so a Learn outage doesn't hide the practice links.
 */
export function ResultNextSteps({ topics }: { topics: TopicResultDto[] }) {
  const weak = topics.filter((t) => t.needsWork).slice(0, MAX_TOPICS);
  const weakKey = weak.map((t) => t.topic).join('|');
  const [plans, setPlans] = useState<TopicPlan[] | null>(null);

  useEffect(() => {
    if (!weakKey) return;
    let cancelled = false;
    (async () => {
      const [learn, ...practice] = await Promise.allSettled([
        getLearnProgress(),
        ...weak.map((t) => listPracticeQuestions({ topic: t.topic, status: 'UNSOLVED', sort: 'recommended', pageSize: PROBLEMS_PER_TOPIC })),
      ]);
      if (cancelled) return;
      const lessonsByTopic = new Map(learn.status === 'fulfilled' ? learn.value.byTopic.map((b) => [b.topic, b]) : []);
      setPlans(
        weak.map((topic, i) => {
          const res = practice[i];
          return {
            topic,
            lessonCount: lessonsByTopic.get(topic.topic)?.total ?? 0,
            lessonsCompleted: lessonsByTopic.get(topic.topic)?.completed ?? 0,
            problems: res.status === 'fulfilled' ? res.value.data : [],
          };
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
    // weakKey captures the only input that matters; `weak` is re-derived each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weakKey]);

  if (topics.length === 0) return null;

  if (weak.length === 0) {
    return (
      <div className="card">
        <div className="page-header" style={{ marginBottom: '0.35rem' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Compass size={17} /> What next
          </h2>
        </div>
        <p style={{ marginTop: 0 }}>You earned at least half the marks in every topic on this assessment — no weak topics to flag.</p>
        <Link to="/student/practice/problems?status=UNSOLVED&sort=recommended">
          <button className="btn-secondary btn-small">Keep practicing →</button>
        </Link>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="page-header" style={{ marginBottom: '0.35rem' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Compass size={17} /> What next
        </h2>
      </div>
      <p className="field-hint" style={{ marginTop: 0 }}>
        Recommended because you earned less than half the marks in {weak.length === 1 ? 'this topic' : 'these topics'}.
      </p>

      {!plans ? (
        <LoadingRow label="Finding lessons and problems…" />
      ) : (
        plans.map(({ topic, lessonCount, lessonsCompleted, problems }) => (
          <div key={topic.topic} className="assessment-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ minWidth: 0, flex: '1 1 260px' }}>
              <p className="assessment-row-title">{topic.topic}</p>
              <p className="assessment-row-meta">
                {topic.percentage}% of marks · {topic.solvedQuestions}/{topic.totalQuestions} solved
              </p>
              {problems.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {problems.map((p) => (
                    <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem' }}>
                      <Code2 size={14} aria-hidden="true" />
                      <Link to={`/student/practice/problems/${p.id}`}>{p.title}</Link>
                      <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>{p.difficulty}</span>
                    </li>
                  ))}
                </ul>
              )}
              {problems.length === 0 && lessonCount === 0 && (
                <p className="assessment-row-meta" style={{ marginTop: '0.5rem' }}>
                  No lessons or unsolved practice problems for this topic yet.
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {lessonCount > 0 && (
                <Link to={`/student/learn/${encodeURIComponent(topic.topic)}`}>
                  <button className="btn-secondary btn-small">
                    <BookOpen size={14} /> {lessonsCompleted >= lessonCount ? 'Review' : 'Learn'} {topic.topic}
                  </button>
                </Link>
              )}
              {problems.length > 0 && (
                <Link to={`/student/practice/problems?topic=${encodeURIComponent(topic.topic)}&status=UNSOLVED&sort=recommended`}>
                  <button className="btn-secondary btn-small">All {topic.topic} problems →</button>
                </Link>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
