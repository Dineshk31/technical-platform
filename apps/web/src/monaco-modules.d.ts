// monaco-editor's package.json "exports" map only publishes type declarations for its
// root entry ("."), not for the deep per-file subpaths we import to avoid bundling all
// ~80 built-in languages (see src/lib/monaco-setup.ts). The JS files resolve fine at
// runtime via the "./*.js" -> "./esm/vs/*.js" export map entry; these declarations just
// satisfy the compiler.
declare module 'monaco-editor/editor/editor.api.js' {
  export * from 'monaco-editor';
}
declare module 'monaco-editor/languages/definitions/cpp/register.js';
declare module 'monaco-editor/languages/definitions/java/register.js';
declare module 'monaco-editor/languages/definitions/python/register.js';
declare module 'monaco-editor/editor/editor.worker.js';
