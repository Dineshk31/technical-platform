const MAX_ERROR_LENGTH = 4000;

/**
 * Compiler/runtime stderr is safe to show a student because it describes
 * their own code (docs/coding-engine.md §5) — but it can still leak the
 * absolute host filesystem layout (e.g. `C:\Users\...\AppData\Local\Temp\
 * exec-<uuid>\source.cpp`) which is exactly the kind of host fingerprinting
 * docs/security.md §4 calls out. Strip absolute paths and cap length before
 * this text is ever written to the `submissions`/`submission_test_results`
 * tables the student-facing DTO reads from.
 */
export function sanitizeErrorText(text: string, workDir: string): string {
  let sanitized = text.split(workDir).join('<workspace>');
  sanitized = sanitized.replace(/[A-Za-z]:\\(?:[^\s:*?"<>|\r\n\\]+\\)*[^\s:*?"<>|\r\n]+/g, '<path>');
  sanitized = sanitized.replace(/\/(?:[^\s:*?"<>|\r\n/]+\/)+[^\s:*?"<>|\r\n]+/g, '<path>');
  if (sanitized.length > MAX_ERROR_LENGTH) {
    sanitized = `${sanitized.slice(0, MAX_ERROR_LENGTH)}\n... (truncated)`;
  }
  return sanitized;
}
