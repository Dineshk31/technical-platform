import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthenticatedUser } from '@technical-platform/shared';
import { apiFetch, ApiError, setAccessToken, tryRefresh, type LoginResponse } from '../lib/api-client';

interface AuthContextValue {
  user: AuthenticatedUser | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  // On first load, try to silently resume a session from the refresh cookie
  // (set by a previous login) — the server, not localStorage, is the source
  // of truth for whether the session is still valid.
  useEffect(() => {
    let cancelled = false;
    // Goes through the same deduplicated tryRefresh() as api-client's own 401 retry, so
    // React StrictMode's dev-mode double-invoke of this effect shares one in-flight
    // request instead of racing two against the single-use rotating refresh token.
    tryRefresh().then((result) => {
      if (cancelled) return;
      if (result) {
        setUser(result.user);
        setStatus('authenticated');
      } else {
        setStatus('unauthenticated');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email: string, password: string) {
    const result = await apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(result.accessToken);
    setUser(result.user);
    setStatus('authenticated');
  }

  async function logout() {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (error) {
      // Even if the server call fails (e.g. token already expired), the
      // client should still forget its local session.
      if (!(error instanceof ApiError)) throw error;
    } finally {
      setAccessToken(null);
      setUser(null);
      setStatus('unauthenticated');
    }
  }

  return <AuthContext.Provider value={{ user, status, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
