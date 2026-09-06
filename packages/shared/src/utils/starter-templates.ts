import type { ProgrammingLanguageCode } from '../enums/question.enum.js';

/**
 * Generic, language-appropriate boilerplate used only when a question has no
 * question-specific starter template of its own (docs: "do not assume one
 * universal template works for every problem" — question-specific always wins;
 * this is just a reasonable floor so no question is ever blank).
 */
export const GENERIC_STARTER_TEMPLATES: Record<ProgrammingLanguageCode, string> = {
  CPP: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    // Write your solution here

    return 0;
}
`,
  JAVA: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));

        // Write your solution here

    }
}
`,
  PYTHON: `import sys
input = sys.stdin.readline

# Write your solution here
`,
};

export function getGenericStarterCode(language: ProgrammingLanguageCode): string {
  return GENERIC_STARTER_TEMPLATES[language];
}
