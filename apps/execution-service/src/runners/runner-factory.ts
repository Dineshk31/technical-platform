import type { ToolchainConfig } from '../config/env.js';
import type { LanguageRunner } from '../sandbox/sandbox.interface.js';
import { CppRunner } from './cpp.runner.js';
import { JavaRunner } from './java.runner.js';
import { PythonRunner } from './python.runner.js';

export type SupportedLanguage = 'CPP' | 'JAVA' | 'PYTHON';

/** A fresh runner per submission — see the note on LanguageRunner about why
 * these are never shared singletons. */
export function createRunner(language: SupportedLanguage, toolchain: ToolchainConfig): LanguageRunner {
  switch (language) {
    case 'CPP':
      return new CppRunner(toolchain.cpp.compiler);
    case 'JAVA':
      return new JavaRunner(toolchain.java.javac, toolchain.java.java);
    case 'PYTHON':
      return new PythonRunner(toolchain.python.interpreter);
  }
}
