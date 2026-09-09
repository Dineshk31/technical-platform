/**
 * Phase 15 — `FRONTEND_URL` accepts one URL (the original, unchanged default) or a
 * comma-separated list of URLs, so a single API can legitimately serve more than one
 * origin (an apex domain plus its `www` alias, or a staging + production frontend)
 * without ever widening CORS to a wildcard. Never returns an empty array — an empty/
 * whitespace-only input degrades to a single empty-string entry, which `enableCors`
 * will simply never match (fails closed, not open).
 */
export function parseAllowedOrigins(frontendUrl: string): string[] {
  const origins = frontendUrl
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return origins.length > 0 ? origins : [''];
}
