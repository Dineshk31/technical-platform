import { describe, expect, it } from 'vitest';
import { guessSnippetLanguage } from './snippet-language';

describe('guessSnippetLanguage', () => {
  it('recognises unambiguous C++, Java and Python snippets', () => {
    expect(guessSnippetLanguage('#include <vector>\nint main() {}')).toBe('cpp');
    expect(guessSnippetLanguage('vector<int> a; cout << a.size();')).toBe('cpp');
    expect(guessSnippetLanguage('System.out.println(x);')).toBe('java');
    expect(guessSnippetLanguage('from bisect import bisect_left\nprint(bisect_left(a, 2))')).toBe('python');
  });

  it('does not mistake a Java import for Python, and leaves anything unclear unlabelled', () => {
    expect(guessSnippetLanguage('import java.util.*;\nint x = 1;')).toBeUndefined();
    expect(guessSnippetLanguage('x = x ^ y')).toBeUndefined();
  });
});
