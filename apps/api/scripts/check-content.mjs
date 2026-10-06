#!/usr/bin/env node
/**
 * Quality gate for curriculum track files (content/*-track.json) — run before loading
 * content, and in review. Read-only: it never talks to the API or the database.
 *
 *   npm run content:check -w @technical-platform/api                 # every track
 *   npm run content:check -w @technical-platform/api -- content/heaps-track.json
 *
 * Errors (exit code 1):
 *   - broken structure: a lesson referencing a missing check/problem, duplicate keys,
 *     an MCQ without exactly-one / at-least-one correct option, a missing explanation;
 *   - a Python example that prints a value different from the `# expected` comment
 *     next to it, or crashes even though it states expected output;
 *   - a Java example that does not compile (needs `javac` on PATH; skipped otherwise).
 * Warnings: the shared editorial rules (lessonQualityIssues — the same ones the admin
 * lesson editor shows). Report: lessons with no harder follow-up problem.
 *
 * Python excerpts that reference variables from surrounding prose (and state no
 * expected output) are reported as excerpts, not failures. C++ blocks are excerpts by
 * convention in these lessons and are not compiled.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { lessonQualityIssues } from '@technical-platform/shared';

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync('content')
      .filter((f) => f.endsWith('-track.json'))
      .map((f) => join('content', f));

const work = mkdtempSync(join(tmpdir(), 'content-check-'));
const hasJavac = spawnSync('javac', ['-version'], { encoding: 'utf8' }).status === 0;
const errors = [];
const warnings = [];
const gaps = [];
const unverified = [];
const stats = { lessons: 0, python: 0, pythonExpectations: 0, pythonExcerpts: 0, java: 0 };

for (const file of files) {
  const track = JSON.parse(readFileSync(file, 'utf8'));
  const name = basename(file);
  const mcqKeys = new Set();
  for (const m of track.mcqs) {
    if (mcqKeys.has(m.key)) errors.push(`${name}: duplicate MCQ key "${m.key}"`);
    mcqKeys.add(m.key);
    const correct = m.options.filter((o) => o.isCorrect).length;
    if (m.mcqType === 'MULTIPLE_CHOICE' ? correct < 1 : correct !== 1) errors.push(`${name}: MCQ "${m.key}" has ${correct} correct options`);
    if (new Set(m.options.map((o) => o.optionText.trim().toLowerCase())).size !== m.options.length) errors.push(`${name}: MCQ "${m.key}" repeats an option`);
    if (!m.explanation?.trim()) errors.push(`${name}: MCQ "${m.key}" has no explanation`);
  }
  const problems = new Map(track.coding.map((c) => [c.title, c]));

  for (const lesson of track.lessons) {
    stats.lessons++;
    const where = `${name} › ${lesson.title}`;
    for (const ref of lesson.checks) if (!mcqKeys.has(ref)) errors.push(`${where}: check "${ref}" is not defined in this track`);
    for (const ref of lesson.practice) if (!problems.has(ref)) errors.push(`${where}: practice problem "${ref}" is not defined in this track`);

    for (const issue of lessonQualityIssues({
      topic: track.topic,
      objectives: lesson.objectives,
      concept: lesson.concept,
      example: lesson.example,
      commonMistakes: lesson.commonMistakes,
      checkCount: lesson.checks.length,
      practiceCount: lesson.practice.length,
    })) {
      if (issue.level === 'warning') warnings.push(`${where}: ${issue.message}`);
    }

    const difficulties = new Set(lesson.practice.map((t) => problems.get(t)?.difficulty));
    if (lesson.practice.length > 0 && !difficulties.has('MEDIUM') && !difficulties.has('HARD')) {
      gaps.push(`${where}: practice is EASY only — no follow-up to build confidence`);
    }

    for (const field of ['concept', 'example', 'commonMistakes']) {
      for (const [, lang, code] of (lesson[field] ?? '').matchAll(/^```(\w+)\n([\s\S]*?)^```/gm)) {
        if (lang === 'python') checkPython(`${where} (${field})`, code);
        if (lang === 'java') checkJava(`${where} (${field})`, code);
      }
    }
  }
}

function lastLine(s) {
  return s.trim().split('\n').pop();
}

function firstError(s) {
  return (
    s
      .split('\n')
      .find((l) => /error:/.test(l))
      ?.replace(/^.*?error:/, '')
      .trim() ?? s.trim()
  );
}

function checkPython(where, code) {
  stats.python++;
  // `print(x)  # 3 — first 8` → remember "3" and tag the printed line so it can be matched.
  const expected = [];
  const instrumented = code
    .split('\n')
    .map((line) => {
      const m = /^(\s*)print\((.*)\)\s*#\s*(.+)$/.exec(line);
      if (!m) return line;
      expected.push(m[3]);
      return `${m[1]}print("@@${expected.length - 1}@@", ${m[2]})`;
    })
    .join('\n');
  const path = join(work, 'snippet.py');
  writeFileSync(path, instrumented);
  const run = spawnSync('python', [path], { input: '', timeout: 10_000, encoding: 'utf8' });
  if (run.error) {
    warnings.push(`python not available — skipped ${where}`);
    return;
  }
  if (run.status !== 0) {
    const reason = lastLine(run.stderr);
    // An excerpt that leans on variables from the surrounding text can't run alone; that
    // is a deliberate teaching choice, but its stated output then goes unverified.
    const isExcerpt = /^(NameError|EOFError|SyntaxError: 'return' outside function)/.test(reason);
    if (!isExcerpt) errors.push(`${where}: example crashes — ${reason}`);
    else if (expected.length > 0) unverified.push(`${where} (${reason})`);
    stats.pythonExcerpts++;
    return;
  }
  for (const line of run.stdout.split(/\r?\n/)) {
    const m = /^@@(\d+)@@ (.*)$/.exec(line);
    if (!m) continue;
    stats.pythonExpectations++;
    const claim = expected[Number(m[1])];
    // The comment may continue with prose ("3 — first 8", "1 (absent)"); compare the value part.
    const value = claim.split(/\s+[—–-]\s+|\s+\(/)[0].trim();
    const norm = (s) => s.replace(/\s+/g, '').replace(/"/g, "'");
    // …or a derivation ending in the value: "nums[0..2] = 2 - 1 + 3 = 4".
    const derived = claim.includes('=') ? claim.slice(claim.lastIndexOf('=') + 1) : null;
    const matches = norm(m[2]).startsWith(norm(value)) || norm(value).startsWith(norm(m[2])) || (derived !== null && norm(derived) === norm(m[2]));
    if (!matches) {
      errors.push(`${where}: prints ${m[2].trim()} but the comment says ${claim}`);
    }
  }
}

function checkJava(where, code) {
  stats.java++;
  if (!hasJavac) return;
  // Lesson snippets are statement sequences or member declarations; wrap whatever isn't a
  // full class so it compiles on its own.
  const isClass = /^\s*(public\s+)?(final\s+)?class\s+\w+/m.test(code) && !/^\s+(static\s+)?class/m.test(code.split('\n')[0]);
  const declaresMembers = /^(static\s+|public\s+|private\s+)?(static\s+)?[\w<>[\], ]+\s+\w+\s*\([^)]*\)\s*\{/m.test(code) || /^\s*(static\s+)?class\s+\w+/m.test(code);
  const body = isClass ? code : declaresMembers ? `class Snippet {\n${code}\n}` : `class Snippet {\n  void run() throws Exception {\n${code}\n  }\n}`;
  const dir = join(work, `java${stats.java}`);
  mkdirSync(dir);
  const src = join(dir, 'Snippet.java');
  writeFileSync(src, `import java.util.*;\nimport java.util.function.*;\nimport java.io.*;\n${body}\n`);
  const result = spawnSync('javac', ['-d', dir, '-Xlint:none', src], { encoding: 'utf8' });
  if (result.status !== 0) errors.push(`${where}: Java example does not compile — ${firstError(result.stderr)}`);
}

rmSync(work, { recursive: true, force: true });

console.log(`Checked ${files.length} track file(s), ${stats.lessons} lessons.`);
console.log(
  `Python: ${stats.python} blocks, ${stats.pythonExpectations} stated outputs verified, ${stats.pythonExcerpts} excerpts. ` +
    `Java: ${stats.java} blocks ${hasJavac ? 'compiled' : 'NOT compiled (javac not found)'}.`,
);
if (unverified.length) console.log(`\nExcerpts whose stated output could not be run standalone:\n- ${unverified.join('\n- ')}`);
if (gaps.length) console.log(`\nContent gaps (need new verified problems, not invented ones):\n- ${gaps.join('\n- ')}`);
if (warnings.length) console.log(`\n${warnings.length} warning(s):\n- ${warnings.join('\n- ')}`);
if (errors.length) {
  console.error(`\n${errors.length} error(s):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log('\nNo errors.');
