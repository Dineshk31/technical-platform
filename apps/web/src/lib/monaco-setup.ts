// Core editor only — NOT the top-level `monaco-editor` package, which registers all
// ~80 bundled languages and would bloat the bundle by megabytes for languages this
// assessment platform never uses. Only the 3 languages Phase 5 needs are registered
// below (see docs/coding-engine.md — C/JavaScript are future additions, one import
// line each when that day comes).
//
// Path note: monaco-editor's package.json exports map is `"./*.js": "./esm/vs/*.js"` —
// so `monaco-editor/editor/editor.api.js` (no "esm/vs/" prefix) is what resolves to
// `esm/vs/editor/editor.api.js` on disk; adding the prefix yourself double-applies it.
import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/languages/definitions/cpp/register.js';
import 'monaco-editor/languages/definitions/java/register.js';
import 'monaco-editor/languages/definitions/python/register.js';
import { loader } from '@monaco-editor/react';

// Point @monaco-editor/react at this locally bundled instance instead of its default
// behavior of fetching a copy from a CDN at runtime — keeps the assessment
// environment self-contained (no runtime dependency on a third-party CDN being reachable).
loader.config({ monaco });

// C++/Java/Python only need Monarch-based tokenization (no language server), so the
// generic editor worker is the only one this app needs.
self.MonacoEnvironment = {
  getWorker() {
    return new Worker(new URL('./monaco.worker.ts', import.meta.url), { type: 'module' });
  },
};

export { monaco };
