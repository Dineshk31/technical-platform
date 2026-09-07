/**
 * Nest DI token for the injected `AIProvider` (packages/shared). `AiModule`
 * binds this to `GeminiProvider` today; adding `OpenAIProvider`/`ClaudeProvider`
 * later is a new class + changing this one binding — see docs/ai-integration.md §2.
 */
export const AI_PROVIDER = Symbol('AI_PROVIDER');
