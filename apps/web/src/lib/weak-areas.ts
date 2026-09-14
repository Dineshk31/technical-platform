export interface TopicProgress {
  topic: string;
  total: number;
  solved: number;
  attempted: number;
}

export interface WeakArea extends TopicProgress {}

/**
 * A real, transparent "weak area" rule (§P1-7 of the transformation plan) — never
 * a fabricated/ML recommendation. A topic only qualifies when there are at least
 * 2 approved problems in it AND the student has solved none of them — i.e. there's
 * a real, meaningfully-sized gap, not just "hasn't gotten to it yet" (a topic with
 * only 1 problem, or one the student simply hasn't opened, doesn't qualify). Ranked
 * by attempted-but-unsolved count first (the strongest "actually struggling" signal),
 * then by topic size.
 */
export function resolveWeakAreas(byTopic: TopicProgress[], limit = 3): WeakArea[] {
  return byTopic
    .filter((t) => t.total >= 2 && t.solved === 0)
    .sort((a, b) => b.attempted - a.attempted || b.total - a.total)
    .slice(0, limit);
}
