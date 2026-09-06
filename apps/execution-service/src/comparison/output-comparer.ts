/**
 * Output comparison rules (docs/coding-engine.md §5):
 *   - normalize line endings (CRLF -> LF)
 *   - strip trailing whitespace from each line
 *   - ignore a trailing run of blank lines (a program that prints one extra
 *     trailing newline is a near-universal, harmless language/print-function
 *     quirk — not a wrong answer)
 * Deliberately NOT normalized: internal whitespace, blank lines in the
 * middle of the output, or case — loosening those would let a genuinely
 * wrong answer pass, which the spec explicitly warns against.
 */
export function normalizeOutput(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

export function outputsMatch(actual: string, expected: string): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected);
}
