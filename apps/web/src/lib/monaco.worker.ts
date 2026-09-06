// A relative-path worker entry point, re-exporting Monaco's own worker. Referenced via
// `new URL('./monaco.worker.ts', import.meta.url)` in monaco-setup.ts — Vite's worker
// plugin resolves a same-tree relative path reliably, unlike a bare package specifier
// passed straight to `new URL()`.
import 'monaco-editor/editor/editor.worker.js';
