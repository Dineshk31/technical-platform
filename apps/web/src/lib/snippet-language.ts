/**
 * Knowledge-check snippets are stored without a language tag. Guess only from
 * unambiguous markers so a snippet is never labelled with the wrong language — anything
 * else is shown as plain, unlabelled code.
 */
export function guessSnippetLanguage(code: string): string | undefined {
  if (/#include\s*<|\bstd::|\bcout\s*<</.test(code)) return 'cpp';
  if (/\bSystem\.out\.|\bpublic\s+(static\s+)?(void|class|int)\b/.test(code)) return 'java';
  // Python never ends statements with ';' — guards against a Java/C++ `import ...;` line.
  if (/^\s*(def |print\(|import |from \w+ import )/m.test(code) && !/;\s*$/m.test(code)) return 'python';
  return undefined;
}
