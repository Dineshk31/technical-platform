import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { GraduationCap, ShieldCheck, Sparkles, Timer } from 'lucide-react';
import { ApiError } from '../lib/api-client';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';

export function LoginPage() {
  const { user, status, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated' && user) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-brand-pane">
        <div className="auth-brand-mark">
          <span className="auth-brand-mark-icon">
            <GraduationCap size={20} />
          </span>
          Centurion University
        </div>

        <div className="auth-brand-copy">
          <h1>Technical Assessment Platform</h1>
          <p>Author, generate, and grade coding &amp; MCQ assessments with server-authoritative timing and judging.</p>
          <div className="auth-brand-features">
            <div className="auth-brand-feature">
              <Timer size={16} /> Server-authoritative timers — no client-side shortcuts
            </div>
            <div className="auth-brand-feature">
              <Sparkles size={16} /> AI-assisted question generation with a full review workflow
            </div>
            <div className="auth-brand-feature">
              <ShieldCheck size={16} /> Hidden test cases and reference solutions stay admin-only
            </div>
          </div>
        </div>

        <div className="auth-brand-footer">Centurion University · Technical Assessment Platform</div>
      </div>

      <div className="auth-form-pane">
        <form className="auth-card" onSubmit={handleSubmit}>
          <h1>Sign in</h1>
          <p className="auth-subtitle">Use your university-issued credentials.</p>

          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            style={{ width: '100%' }}
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{ width: '100%' }}
          />

          {error && <p className="form-error">{error}</p>}

          <Button type="submit" disabled={submitting} className="auth-submit">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
