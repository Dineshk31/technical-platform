import type { ApiErrorBody, AuthenticatedUser } from '@technical-platform/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface LoginResponse {
  accessToken: string;
  user: AuthenticatedUser;
}

let currentAccessToken: string | null = null;

/** Called by AuthContext whenever the access token changes (login, refresh, logout). */
export function setAccessToken(token: string | null): void {
  currentAccessToken = token;
}

/**
 * The one place every API call goes through. Always sends cookies (the
 * refresh token lives in an httpOnly cookie — see docs/api-specification.md),
 * attaches the in-memory access token, and retries exactly once after a
 * silent refresh if a request comes back 401.
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}, _retried = false): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(currentAccessToken ? { Authorization: `Bearer ${currentAccessToken}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 401 && !_retried && path !== '/auth/refresh' && path !== '/auth/login') {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return apiFetch<T>(path, options, true);
    }
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'UNKNOWN_ERROR',
      body?.error?.message ?? `Request failed with status ${response.status}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

// Refresh tokens are single-use/rotating (see apps/api auth.service.ts). Without this,
// several requests hitting 401 at once (a handful of parallel fetches right after load,
// e.g. StudentExamPage — or React StrictMode double-invoking AuthContext's mount effect
// in dev) would each start their own /auth/refresh call against the same cookie; the
// first to land rotates the token and revokes the old one, so every other concurrent
// call gets 401 and the whole page appears to log out. Sharing one in-flight refresh
// across every concurrent caller (api-client's own 401 retry AND AuthContext's mount
// effect both call this same function) fixes it at the root instead of per-symptom.
let refreshInFlight: Promise<LoginResponse | null> | null = null;

export function tryRefresh(): Promise<LoginResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function performRefresh(): Promise<LoginResponse | null> {
  try {
    const result = await apiFetch<LoginResponse>('/auth/refresh', { method: 'POST' }, true);
    setAccessToken(result.accessToken);
    return result;
  } catch {
    setAccessToken(null);
    return null;
  }
}
