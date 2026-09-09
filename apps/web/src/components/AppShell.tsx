import { useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  ClipboardList,
  Database,
  LogOut,
  Menu,
  Sparkles,
  ListChecks,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NavItem {
  label: string;
  to: string;
  pathname: string;
  search?: string;
  icon: ReactNode;
}

const ADMIN_NAV: NavItem[] = [
  { label: 'Assessments', to: '/admin', pathname: '/admin', icon: <ClipboardList size={17} /> },
  { label: 'Question Bank', to: '/admin/questions', pathname: '/admin/questions', icon: <Database size={17} /> },
  {
    label: 'AI Generator',
    to: '/admin/questions/ai-generate',
    pathname: '/admin/questions/ai-generate',
    icon: <Sparkles size={17} />,
  },
  {
    label: 'AI Review Queue',
    to: '/admin/questions?source=AI_GENERATED&approvalStatus=PENDING_REVIEW',
    pathname: '/admin/questions',
    search: 'source=AI_GENERATED',
    icon: <ListChecks size={17} />,
  },
];

const STUDENT_NAV: NavItem[] = [
  { label: 'My Assessments', to: '/student', pathname: '/student', icon: <ClipboardList size={17} /> },
];

function resolveActiveLabel(pathname: string, search: string, items: NavItem[]): string {
  const withQuery = items.find((i) => i.search && pathname === i.pathname && search.includes(i.search));
  if (withQuery) return withQuery.label;
  const candidates = items.filter((i) => !i.search && pathname.startsWith(i.pathname)).sort((a, b) => b.pathname.length - a.pathname.length);
  return candidates[0]?.label ?? '';
}

function isNavItemActive(item: NavItem, pathname: string, search: string, items: NavItem[]): boolean {
  return resolveActiveLabel(pathname, search, items) === item.label;
}

function initials(name: string | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function AppShell({ role }: { role: 'ADMIN' | 'STUDENT' }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = role === 'ADMIN' ? ADMIN_NAV : STUDENT_NAV;
  const title = resolveActiveLabel(location.pathname, location.search, items) || (role === 'ADMIN' ? 'Assessments' : 'My Assessments');

  return (
    <div className="app-shell">
      {mobileOpen && <div className="app-sidebar-scrim" onClick={() => setMobileOpen(false)} />}
      <aside className={`app-sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="app-sidebar-brand">
          <div className="app-sidebar-brand-mark">CU</div>
          <div className="app-sidebar-brand-text">
            <div className="app-sidebar-brand-title">Centurion</div>
            <div className="app-sidebar-brand-subtitle">Technical Assessment</div>
          </div>
        </div>
        <nav className="app-nav">
          {items.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className={`app-nav-link ${isNavItemActive(item, location.pathname, location.search, items) ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="app-sidebar-footer">
          <button type="button" className="btn-ghost btn-icon btn-small" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => void logout()}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="app-content">
        <header className="app-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              type="button"
              className="icon-btn app-sidebar-toggle"
              aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <h1 className="app-topbar-title">{title}</h1>
          </div>
          <div className="app-topbar-right">
            <div className="app-user-chip">
              <div className="app-user-avatar">{initials(user?.name)}</div>
              <div className="app-user-meta">
                <div className="app-user-name">{user?.name}</div>
                <div className="app-user-role">{role}</div>
              </div>
            </div>
          </div>
        </header>
        <div className="app-main-scroll">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
