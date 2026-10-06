#!/usr/bin/env node
/**
 * Loads a curriculum track (e.g. content/arrays-track.json) into a running API through
 * the real admin endpoints, so every item goes through the same validation,
 * reference-solution verification and review gates as content authored in the UI.
 *
 * It never approves or publishes anything: coding problems and MCQs are created
 * PENDING_REVIEW and lessons as drafts. A person must review them in the admin UI
 * (Question Bank, then Lessons → Review & publish) before students can see them.
 *
 * Idempotent: an item whose title already exists is reused, never duplicated.
 *
 *   API_URL=https://example.org/api/v1 \
 *   CONTENT_ADMIN_EMAIL=... CONTENT_ADMIN_PASSWORD=... \
 *   npm run content:load -w @technical-platform/api -- content/arrays-track.json
 *
 * --update-drafts  instead of loading, copies edited lesson text (summary, objectives, explanation,
 *                  worked example, common mistakes) from the file into lessons that
 *                  already exist as DRAFTS. Only fields that differ are sent; question
 *                  links are left alone. Published lessons are never changed — they are
 *                  listed so a person can update them in the editor deliberately.
 * --dry-run        with --update-drafts: report what would change, write nothing.
 *
 * Run `npm run content:check` first. API_URL defaults to http://localhost:4000/api/v1.
 * Credentials are only ever read from the environment — never put them in a content file.
 */
import { readFile } from 'node:fs/promises';

const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const updateDrafts = args.includes('--update-drafts');
const dryRun = args.includes('--dry-run');
const email = process.env.CONTENT_ADMIN_EMAIL;
const password = process.env.CONTENT_ADMIN_PASSWORD;

if (!file || !email || !password) {
  console.error(
    'Usage: CONTENT_ADMIN_EMAIL=... CONTENT_ADMIN_PASSWORD=... node scripts/load-content.mjs <track.json> [--update-drafts [--dry-run]]',
  );
  process.exit(1);
}
if (dryRun && !updateDrafts) {
  console.error('--dry-run only applies to --update-drafts.');
  process.exit(1);
}

const track = JSON.parse(await readFile(file, 'utf8'));

async function call(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const login = await call('POST', '/auth/login', { email, password });
if (login.status >= 300) {
  console.error(`Login failed (${login.status}).`);
  process.exit(1);
}
const token = login.body.accessToken;

if (updateDrafts) {
  await syncDraftLessons();
  process.exit(0);
}

/** --update-drafts: push edited lesson text into existing DRAFT lessons, nothing else. */
async function syncDraftLessons() {
  const TEXT_FIELDS = ['summary', 'objectives', 'concept', 'example', 'commonMistakes'];
  // The API trims strings and stores an omitted optional field as null.
  const normalise = (field, value) =>
    field === 'objectives' ? JSON.stringify((value ?? []).map((o) => o.trim())) : (value ?? '').trim();

  const list = await call('GET', `/lessons?topic=${encodeURIComponent(track.topic)}&pageSize=100`, undefined, token);
  const existing = list.body.data;
  let updated = 0;
  const problems = [];
  for (const lesson of track.lessons) {
    const match = existing.find((l) => l.title === lesson.title);
    if (!match) {
      console.log(`? lesson  ${lesson.title} (not in the database — run without --update-drafts to create it)`);
      continue;
    }
    const current = (await call('GET', `/lessons/${match.id}`, undefined, token)).body;
    const changed = TEXT_FIELDS.filter((f) => normalise(f, lesson[f]) !== normalise(f, current[f]));
    if (changed.length === 0) {
      console.log(`= lesson  ${lesson.title} (up to date)`);
      continue;
    }
    if (current.isPublished) {
      console.log(`! lesson  ${lesson.title} is PUBLISHED — not changed (${changed.join(', ')} differ; update it in the editor)`);
      continue;
    }
    if (dryRun) {
      console.log(`~ lesson  ${lesson.title} (would update: ${changed.join(', ')})`);
      continue;
    }
    const patch = Object.fromEntries(changed.map((f) => [f, lesson[f]]));
    const res = await call('PATCH', `/lessons/${match.id}`, patch, token);
    if (res.status !== 200) problems.push(`update "${lesson.title}": ${res.status} ${JSON.stringify(res.body?.error ?? res.body)}`);
    else {
      updated++;
      console.log(`~ lesson  ${lesson.title} (updated: ${changed.join(', ')}; still a draft)`);
    }
  }
  console.log(dryRun ? '\nDry run — nothing was written.' : `\n${updated} draft lesson(s) updated. Nothing was published.`);
  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
}

async function findQuestion(title) {
  const res = await call('GET', `/questions?pageSize=100&search=${encodeURIComponent(title)}`, undefined, token);
  return res.body.data.find((q) => q.title === title) ?? null;
}

const ids = new Map();
const failures = [];

for (const problem of track.coding) {
  const existing = await findQuestion(problem.title);
  if (existing) {
    ids.set(problem.title, existing.id);
    console.log(`= coding  ${problem.title} (exists, ${existing.approvalStatus})`);
    continue;
  }
  const res = await call('POST', '/questions/coding', problem, token);
  if (res.status !== 201) {
    failures.push(`coding "${problem.title}": ${res.status} ${JSON.stringify(res.body?.error ?? res.body)}`);
    continue;
  }
  ids.set(problem.title, res.body.id);
  console.log(`+ coding  ${problem.title} (PENDING_REVIEW)`);
}

for (const { key, ...mcq } of track.mcqs) {
  const existing = await findQuestion(mcq.title);
  if (existing) {
    ids.set(key, existing.id);
    console.log(`= mcq     ${mcq.title} (exists, ${existing.approvalStatus})`);
    continue;
  }
  const res = await call('POST', '/questions/mcq', mcq, token);
  if (res.status !== 201) {
    failures.push(`mcq "${mcq.title}": ${res.status} ${JSON.stringify(res.body?.error ?? res.body)}`);
    continue;
  }
  ids.set(key, res.body.id);
  console.log(`+ mcq     ${mcq.title} (PENDING_REVIEW)`);
}

// New coding problems are verified automatically on create; practice links need that
// verification to have passed, so wait for it (and re-run it once if the host was slow).
for (const problem of track.coding) {
  const id = ids.get(problem.title);
  if (!id) continue;
  let verification = await waitForVerification(id);
  if (verification.status !== 'PASSED') {
    await call('POST', `/questions/${id}/verify`, undefined, token);
    verification = await waitForVerification(id);
  }
  const perLanguage = verification.solutions.map((s) => `${s.language} ${s.testsPassed}/${s.testsTotal}`).join(', ');
  console.log(`  verify  ${problem.title}: ${verification.status} (${perLanguage})`);
  if (verification.status !== 'PASSED') failures.push(`verification of "${problem.title}" is ${verification.status}`);
}

async function waitForVerification(id) {
  const deadline = Date.now() + 120_000;
  for (;;) {
    const res = await call('GET', `/questions/${id}`, undefined, token);
    if (res.body.verification.status !== 'PENDING' || Date.now() > deadline) return res.body.verification;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const existingLessons = (await call('GET', `/lessons?topic=${encodeURIComponent(track.topic)}&pageSize=100`, undefined, token)).body.data;
const baseOrder = existingLessons.length;
for (const [i, lesson] of track.lessons.entries()) {
  if (existingLessons.some((l) => l.title === lesson.title)) {
    console.log(`= lesson  ${lesson.title} (exists)`);
    continue;
  }
  const missing = [...lesson.checks, ...lesson.practice].filter((ref) => !ids.has(ref));
  if (missing.length > 0) {
    failures.push(`lesson "${lesson.title}": missing ${missing.join(', ')}`);
    continue;
  }
  const res = await call(
    'POST',
    '/lessons',
    {
      topic: track.topic,
      title: lesson.title,
      summary: lesson.summary,
      objectives: lesson.objectives,
      concept: lesson.concept,
      example: lesson.example,
      commonMistakes: lesson.commonMistakes,
      orderIndex: baseOrder + i,
      isPublished: false,
      checkQuestionIds: lesson.checks.map((k) => ids.get(k)),
      practiceQuestionIds: lesson.practice.map((t) => ids.get(t)),
    },
    token,
  );
  if (res.status !== 201) failures.push(`lesson "${lesson.title}": ${res.status} ${JSON.stringify(res.body?.error ?? res.body)}`);
  else console.log(`+ lesson  ${lesson.title} (draft)`);
}

console.log('\nNothing was approved or published. Review the new questions in the Question Bank,');
console.log('then open each lesson in Lessons → Review & publish.');
if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
